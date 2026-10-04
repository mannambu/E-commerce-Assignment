import databaseService from './database.services'
import { UserRole } from '~/models/schemas/User.schema'
import { OrderStatus } from '~/models/schemas/Order.schema'
import { toLocalDate } from '~/models/schemas/common'

class AdminService {
  async getDashboardStats() {
    const [totalCustomers, totalFoods, orderCounts] = await Promise.all([
      databaseService.users.countDocuments({ role: UserRole.CUSTOMER }),
      databaseService.foods.countDocuments({ isActive: true }),
      databaseService.orders
        .aggregate<{ _id: OrderStatus; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray()
    ])

    const byStatus: Record<OrderStatus, number> = {
      Pending: 0,
      Confirmed: 0,
      Cooking: 0,
      Delivering: 0,
      Completed: 0,
      Cancelled: 0
    }
    for (const row of orderCounts) {
      if (Object.hasOwn(byStatus, row._id)) byStatus[row._id] = row.count
    }

    // Dashboard Admin chỉ trả số liệu vận hành; báo cáo tiền thuộc Manager.
    return {
      users: { customers: totalCustomers },
      products: { foods: totalFoods },
      orders: { total: Object.values(byStatus).reduce((sum, count) => sum + count, 0), byStatus }
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
