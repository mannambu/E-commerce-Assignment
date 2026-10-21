import { ClientSession, Db, MongoClient, ObjectId } from 'mongodb'

const newKey = { orderId: 1, deliveryId: 1, foodId: 1 } as const
const newName = 'one_review_per_delivery_food'
const sameKey = (left: object, right: object) => JSON.stringify(left) === JSON.stringify(right)
export type ReviewDeliveryMapping = Record<string, string>
export class ReviewMigrationError extends Error {}
type Names = { reviews: string; orders: string; foods: string }
function names(env = process.env): Names {
  return {
    reviews: env.DB_REVIEWS_COLLECTION || 'reviews',
    orders: env.DB_ORDERS_COLLECTION || 'orders',
    foods: env.DB_FOODS_COLLECTION || 'foods'
  }
}

/** Read-only. Only infer an unambiguous Completed delivery, never choose between days. */
export async function inspectReviewMigration(
  db: Db,
  mapping: ReviewDeliveryMapping = {},
  collections = names(),
  session?: ClientSession
) {
  const issues: { reviewId?: string; message: string }[] = []
  const backfills: { reviewId: ObjectId; deliveryId: ObjectId }[] = []
  const reviews = await db.collection(collections.reviews).find({}, { session }).toArray()
  const indexes = (await db.listCollections({ name: collections.reviews }).hasNext())
    ? await db.collection(collections.reviews).listIndexes().toArray()
    : []
  const oldIndexes: string[] = []
  for (const index of indexes) {
    if (index.name === '_id_') continue
    if (index.unique && sameKey(index.key, { orderId: 1 }) && !index.partialFilterExpression && !index.sparse) {
      oldIndexes.push(index.name)
    } else if (
      (index.unique && (!sameKey(index.key, newKey) || index.partialFilterExpression || index.sparse)) ||
      (index.name === newName && (!index.unique || !sameKey(index.key, newKey)))
    ) {
      issues.push({ message: `Unrecognized index ${index.name}; review it manually before migration` })
    }
  }
  const seen = new Set<string>()
  const reviewIds = new Set(reviews.map((review) => String(review._id)))
  for (const key of Object.keys(mapping)) {
    if (!reviewIds.has(key)) issues.push({ reviewId: key, message: 'Mapping refers to a missing review' })
  }
  for (const review of reviews) {
    const reviewId = String(review._id)
    const issue = (message: string) => issues.push({ reviewId, message })
    if (![review._id, review.orderId, review.foodId, review.reviewerId].every((value) => value instanceof ObjectId)) {
      issue('Missing or invalid orderId, foodId, reviewerId or _id; resolve legacy references manually')
      continue
    }
    if (
      !Number.isInteger(review.rating) ||
      review.rating < 1 ||
      review.rating > 5 ||
      typeof review.isHidden !== 'boolean' ||
      !(review.createdAt instanceof Date) ||
      !Number.isFinite(review.createdAt.getTime()) ||
      typeof review.comment !== 'string' ||
      !Array.isArray(review.images)
    )
      issue('Invalid rating, visibility, timestamp or review content; repair explicitly before migration')
    const order = await db
      .collection(collections.orders)
      .findOne({ _id: review.orderId, userId: review.reviewerId }, { session })
    if (!order || !Array.isArray(order.deliveries)) {
      issue('Cannot verify owner and deliveries of the referenced order')
      continue
    }
    if (!(await db.collection(collections.foods).findOne({ _id: review.foodId }, { projection: { _id: 1 }, session })))
      issue('Referenced food no longer exists')
    const candidates = order.deliveries.filter(
      (day) =>
        day._id instanceof ObjectId &&
        day.status === 'Completed' &&
        Array.isArray(day.items) &&
        day.items.some(
          (item: { foodId?: ObjectId }) => item.foodId instanceof ObjectId && item.foodId.equals(review.foodId)
        )
    )
    const selected = mapping[reviewId]
    if (selected !== undefined && (typeof selected !== 'string' || !/^[a-f\d]{24}$/i.test(selected))) {
      issue('Mapping deliveryId must be a 24-character ObjectId')
      continue
    }
    let deliveryId = review.deliveryId
    if (deliveryId != null && !(deliveryId instanceof ObjectId)) {
      issue('Existing deliveryId is invalid')
      continue
    }
    if (deliveryId && selected && !deliveryId.equals(selected)) {
      issue('Mapping cannot overwrite an existing deliveryId')
      continue
    }
    if (!deliveryId)
      deliveryId = selected ? new ObjectId(selected) : candidates.length === 1 ? candidates[0]._id : undefined
    if (!deliveryId || !candidates.some((day) => day._id.equals(deliveryId))) {
      issue('No unique eligible Completed delivery; provide a verified mapping or repair the source data')
      continue
    }
    const key = `${review.orderId}/${deliveryId}/${review.foodId}`
    if (seen.has(key)) issue('Duplicate order + delivery + food (hidden reviews also count); resolve manually')
    seen.add(key)
    if (review.deliveryId == null) backfills.push({ reviewId: review._id, deliveryId })
  }
  return { scanned: reviews.length, issues, backfills, oldIndexes }
}

/** Operator must stop every writer first. No data is removed or merged. Safe to rerun after interruption. */
export async function applyReviewMigration(
  client: MongoClient,
  db: Db,
  mapping: ReviewDeliveryMapping = {},
  collections = names()
) {
  const plan = await inspectReviewMigration(db, mapping, collections)
  if (plan.issues.length) throw new ReviewMigrationError('Migration blocked: resolve every preview issue first')
  const session = client.startSession()
  try {
    await session.withTransaction(
      async () => {
        const checked = await inspectReviewMigration(db, mapping, collections, session)
        if (checked.issues.length) throw new ReviewMigrationError('Data changed since preview; migration blocked')
        for (const change of checked.backfills) {
          const result = await db
            .collection(collections.reviews)
            .updateOne(
              { _id: change.reviewId, deliveryId: null },
              { $set: { deliveryId: change.deliveryId } },
              { session }
            )
          if (result.matchedCount !== 1) throw new ReviewMigrationError('Review changed during migration')
        }
        const ratings = await db
          .collection(collections.reviews)
          .aggregate<{
            _id: ObjectId
            average: number
            count: number
          }>(
            [
              { $match: { isHidden: false } },
              { $group: { _id: '$foodId', average: { $avg: '$rating' }, count: { $sum: 1 } } }
            ],
            { session }
          )
          .toArray()
        await db.collection(collections.foods).updateMany({}, { $set: { rating: 0, reviewCount: 0 } }, { session })
        for (const rating of ratings)
          await db.collection(collections.foods).updateOne(
            { _id: rating._id },
            {
              $set: { rating: Number(rating.average.toFixed(1)), reviewCount: rating.count }
            },
            { session }
          )
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }
    )
  } finally {
    await session.endSession()
  }
  // Build the new constraint successfully before dropping the old, more restrictive one.
  const indexes = (await db.listCollections({ name: collections.reviews }).hasNext())
    ? await db.collection(collections.reviews).listIndexes().toArray()
    : []
  if (!indexes.some((index) => index.unique && sameKey(index.key, newKey)))
    await db.collection(collections.reviews).createIndex(newKey, { unique: true, name: newName })
  for (const name of plan.oldIndexes) await db.collection(collections.reviews).dropIndex(name)
  return { scanned: plan.scanned, backfilled: plan.backfills.length, droppedIndexes: plan.oldIndexes }
}
