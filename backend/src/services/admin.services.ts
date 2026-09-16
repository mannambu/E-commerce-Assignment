import databaseService from './database.services'
import HTTP_STATUS from '~/constants/httpStatus'
import { UserRole } from '~/models/schemas/User.schema'

type FoodDiaryEntrySource = 'Order' | 'Manual' | 'Legacy'

type FoodDiaryBucket = {
  userId: string
  date: Date
  totalCalories: number
  sources: {
    Order: number
    Manual: number
    Legacy: number
  }
  entriesCount: number
}

class AdminService {
  private normalizeDate(value: Date | string) {
    const date = new Date(value)
    date.setHours(0, 0, 0, 0)
    return date
  }

  private buildBucketKey(userId: string, date: Date) {
    return `${userId}-${date.getTime()}`
  }

  private appendCalories(
    buckets: Map<string, FoodDiaryBucket>,
    userId: string,
    date: Date,
    source: FoodDiaryEntrySource,
    calories: number
  ) {
    if (!Number.isFinite(calories) || calories <= 0) return

    const normalizedDate = this.normalizeDate(date)
    const key = this.buildBucketKey(userId, normalizedDate)

    const current =
      buckets.get(key) ||
      ({
        userId,
        date: normalizedDate,
        totalCalories: 0,
        sources: {
          Order: 0,
          Manual: 0,
          Legacy: 0
        },
        entriesCount: 0
      } as FoodDiaryBucket)

    current.totalCalories += calories
    current.sources[source] += calories
    current.entriesCount += 1
    buckets.set(key, current)
  }

  async getDashboardStats() {
    // Lấy mốc thời gian ngày đầu tiên của tháng hiện tại (Để tính doanh thu tháng này)
    const currentMonthStart = new Date()
    currentMonthStart.setDate(1)
    currentMonthStart.setHours(0, 0, 0, 0)

    const [totalCustomers, totalPTs, totalFoods, totalPTServices, revenueData] = await Promise.all([
      databaseService.users.countDocuments({ role: UserRole.CUSTOMER }),
      databaseService.users.countDocuments({ role: UserRole.PT }),
      databaseService.foods.countDocuments({ isActive: true }),
      databaseService.ptServices.countDocuments({ isActive: true }),
      
      // KỸ THUẬT $FACET: Thống kê nhiều chiều dữ liệu trong 1 lần query
      databaseService.orders.aggregate([
        { $match: { status: 'Completed' } }, // Chỉ tính tiền những đơn đã hoàn thành
        {
        $facet: {
            // 1. Tổng doanh thu
            overall: [
              {
                $group: {
                  _id: null,
                  totalRevenue: { $sum: '$subtotal' },
                  totalOrders: { $sum: 1 }
                }
              }
            ],
            // 2. Tháng hiện tại
            thisMonth: [
              { $match: { createdAt: { $gte: currentMonthStart } } },
              {
                $group: {
                  _id: null,
                  revenue: { $sum: '$subtotal' },
                  orders: { $sum: 1 }
                }
              }
            ],
            // 3. SỬA CHỖ NÀY: Phân bổ doanh thu theo packageType
            byPackageType: [
              {
                $group: {
                  _id: '$packageType', // Group theo đúng tên trường trong MongoDB
                  revenue: { $sum: '$subtotal' },
                  orders: { $sum: 1 }
                }
              }
            ]
          }
        }
      ]).toArray()
    ])

    const stats = revenueData[0] || { overall: [], thisMonth: [], byPackageType: [] }
    
    const overallStats = stats.overall[0] || { totalRevenue: 0, totalOrders: 0 }
    const thisMonthStats = stats.thisMonth[0] || { revenue: 0, orders: 0 }
    
    // Format lại dữ liệu cho Frontend (FOOD tương đương ONE_DAY, COMBO tương đương WEEKLY_7D)
    const revenueBreakdown = {
      FOOD_ONE_DAY: { revenue: 0, orders: 0 },
      COMBO_WEEKLY: { revenue: 0, orders: 0 },
      OTHER: { revenue: 0, orders: 0 } // Bắt các đơn không có packageType (nếu có)
    }
    
    stats.byPackageType.forEach((item: any) => {
      if (item._id === 'ONE_DAY' || item._id === 'FOOD') { // Check cả 2 phòng trường hợp DB có chữ FOOD
        revenueBreakdown.FOOD_ONE_DAY.revenue += item.revenue
        revenueBreakdown.FOOD_ONE_DAY.orders += item.orders
      } else if (item._id === 'WEEKLY_7D' || item._id === 'COMBO') {
        revenueBreakdown.COMBO_WEEKLY.revenue += item.revenue
        revenueBreakdown.COMBO_WEEKLY.orders += item.orders
      } else {
        revenueBreakdown.OTHER.revenue += item.revenue
        revenueBreakdown.OTHER.orders += item.orders
      }
    })

    return {
      users: {
        customers: totalCustomers,
        pts: totalPTs
      },
      products: {
        foods: totalFoods,
        ptServices: totalPTServices
      },
      revenue: {
        overall: {
          totalAmount: overallStats.totalRevenue,
          completedOrders: overallStats.totalOrders
        },
        thisMonth: {
          totalAmount: thisMonthStats.revenue,
          completedOrders: thisMonthStats.orders
        },
        breakdown: revenueBreakdown // Trả về biến mới
      }
    }
  }

  async getFoodDiaryLogs(daysInput?: string) {
    const parsedDays = Number(daysInput)
    const days = Number.isFinite(parsedDays) ? Math.min(60, Math.max(1, parsedDays)) : 14

    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const [users, logs, completedOrders] = await Promise.all([
      databaseService.users
        .find(
          {},
          {
            projection: {
              username: 1,
              email: 1,
              role: 1,
              calorieTracking: 1
            }
          }
        )
        .toArray(),
      databaseService.calorieLogs.find({ date: { $gte: since } }).toArray(),
      databaseService.orders.find({ status: 'Completed' }).toArray()
    ])

    const userMap = new Map(
      users.map((user) => [String(user._id), { username: user.username || 'Unknown', email: user.email || '', role: user.role }])
    )

    const buckets = new Map<string, FoodDiaryBucket>()
    const orderLogDayKeys = new Set<string>()

    for (const user of users) {
      const userId = String(user._id)
      for (const legacyItem of user.calorieTracking || []) {
        const legacyDate = this.normalizeDate(legacyItem.date)
        if (legacyDate < since) continue
        this.appendCalories(buckets, userId, legacyDate, 'Legacy', Number(legacyItem.caloriesConsumed || 0))
      }
    }

    for (const log of logs) {
      const dayKey = this.buildBucketKey(String(log.userId), this.normalizeDate(log.date))
      if (log.sourceType === 'Order') {
        orderLogDayKeys.add(dayKey)
      }

      this.appendCalories(
        buckets,
        String(log.userId),
        log.date,
        log.sourceType === 'Manual' ? 'Manual' : 'Order',
        Number(log.caloriesConsumed || 0)
      )
    }

    for (const order of completedOrders) {
      const userId = String(order.userId)
      for (const item of order.items || []) {
        const deliveryDate = this.normalizeDate(item.deliveryDate)
        if (deliveryDate < since) continue

        const dayKey = this.buildBucketKey(userId, deliveryDate)
        if (orderLogDayKeys.has(dayKey)) continue

        const calories = Number(item.quantity || 0) * Number(item.calories || 0)
        this.appendCalories(buckets, userId, deliveryDate, 'Order', calories)
      }
    }

    const items = [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        user: userMap.get(bucket.userId) || {
          username: 'Unknown',
          email: '',
          role: UserRole.CUSTOMER
        }
      }))
      .sort((a, b) => {
        if (b.date.getTime() !== a.date.getTime()) {
          return b.date.getTime() - a.date.getTime()
        }
        return b.totalCalories - a.totalCalories
      })

    const summary = items.reduce(
      (acc, item) => {
        acc.totalRows += 1
        acc.totalCalories += item.totalCalories
        acc.orderCalories += item.sources.Order
        acc.manualCalories += item.sources.Manual
        acc.legacyCalories += item.sources.Legacy
        return acc
      },
      {
        totalRows: 0,
        totalCalories: 0,
        orderCalories: 0,
        manualCalories: 0,
        legacyCalories: 0
      }
    )

    return {
      days,
      since,
      summary,
      items
    }
  }
}

const adminService = new AdminService()
export default adminService