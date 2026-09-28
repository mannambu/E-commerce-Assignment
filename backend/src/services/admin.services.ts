import databaseService from './database.services'
import { UserRole } from '~/models/schemas/User.schema'
import { toLocalDate } from '~/models/schemas/common'

class AdminService {
  async getDashboardStats() {
    // Lấy mốc thời gian ngày đầu tiên của tháng hiện tại (Để tính doanh thu tháng này)
    const currentMonthStart = new Date()
    currentMonthStart.setDate(1)
    currentMonthStart.setHours(0, 0, 0, 0)

    const [totalCustomers, totalFoods, revenueData] = await Promise.all([
      databaseService.users.countDocuments({ role: UserRole.CUSTOMER }),
      databaseService.foods.countDocuments({ isActive: true }),

      // KỸ THUẬT $FACET: Thống kê nhiều chiều dữ liệu trong 1 lần query
      databaseService.orders
        .aggregate([
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
        ])
        .toArray()
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
      if (item._id === 'ONE_DAY' || item._id === 'FOOD') {
        // Check cả 2 phòng trường hợp DB có chữ FOOD
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
        customers: totalCustomers
      },
      products: {
        foods: totalFoods
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
    const days = Math.min(60, Math.max(1, Math.floor(Number(daysInput) || 14)))
    const firstDate = new Date()
    firstDate.setUTCDate(firstDate.getUTCDate() - days + 1)
    const since = toLocalDate(firstDate)
    const logs = await databaseService.dailyHealthLogs
      .find({ date: { $gte: since } })
      .sort({ date: -1 })
      .toArray()
    const users = await databaseService.users
      .find({ _id: { $in: logs.map((log) => log.userId) } }, { projection: { username: 1, email: 1, role: 1 } })
      .toArray()
    const userMap = new Map(
      users.map((user) => [
        String(user._id),
        {
          username: user.username,
          email: user.email,
          role: user.role
        }
      ])
    )
    const items = logs.map((log) => {
      const sources = { Order: 0, Manual: 0, MealPlan: 0 }
      for (const meal of log.meals) sources[meal.sourceType] += meal.caloriesConsumed
      return {
        userId: String(log.userId),
        date: log.date,
        totalCalories: sources.Order + sources.Manual + sources.MealPlan,
        sources,
        entriesCount: log.meals.length,
        user: userMap.get(String(log.userId))
      }
    })
    const summary = {
      totalRows: items.length,
      totalCalories: items.reduce((sum, item) => sum + item.totalCalories, 0),
      orderCalories: items.reduce((sum, item) => sum + item.sources.Order, 0),
      manualCalories: items.reduce((sum, item) => sum + item.sources.Manual, 0),
      mealPlanCalories: items.reduce((sum, item) => sum + item.sources.MealPlan, 0)
    }
    return { days, since, summary, items }
  }
}

export default new AdminService()
