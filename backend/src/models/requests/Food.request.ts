import { FoodType } from '~/models/schemas/Food.schema'

// Only fields that Admin may write. Stock holds, ratings and derived fields are server-owned.
export const FOOD_WRITABLE_FIELDS = [
  'name',
  'description',
  'images',
  'price',
  'calories',
  'nutrition',
  'ingredients',
  'tags',
  'stock',
  'isActive',
  'goalTags'
] as const

export type CreateFoodReqBody = Pick<FoodType, Exclude<(typeof FOOD_WRITABLE_FIELDS)[number], 'isActive'>> & {
  isActive?: boolean
}
export type UpdateFoodReqBody = Partial<CreateFoodReqBody>
