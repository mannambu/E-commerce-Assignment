import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import PTService from '~/models/schemas/PTService.schema'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Errors'
import { AccountStatus, UserRole } from '~/models/schemas/User.schema'

class PTServiceLayer {
  private async assertPTCanManageServices(pt_user_id: string) {
    const ptUser = await databaseService.users.findOne(
      { _id: new ObjectId(pt_user_id) },
      { projection: { role: 1, account_status: 1, ptProfile: 1 } }
    )

    if (!ptUser || ptUser.role !== UserRole.PT) {
      throw new ErrorWithStatus({
        message: 'Chỉ PT mới có quyền thao tác tính năng này',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (ptUser.account_status !== AccountStatus.ACTIVE || !ptUser.ptProfile?.approvedByAdmin) {
      throw new ErrorWithStatus({
        message: 'Tài khoản PT chưa được duyệt hoặc chưa kích hoạt',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    return ptUser
  }

  async getPTUserByUsername(username: string) {
    return databaseService.users.findOne(
      { username, role: 'PT' as any },
      {
        projection: {
          password: 0,
          forgot_password_token: 0
        }
      }
    )
  }
  async getPTServiceList(limit: number, page: number) {
    const safeLimit = Math.max(1, Number(limit) || 10)
    const safePage = Math.max(1, Number(page) || 1)
    const skip = (safePage - 1) * safeLimit

    const filter = { isActive: true }

    const [services, total] = await Promise.all([
      databaseService.ptServices.find(filter).skip(skip).limit(safeLimit).sort({ createdAt: -1 }).toArray(),
      databaseService.ptServices.countDocuments(filter)
    ])

    return {
      services,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: Math.ceil(total / safeLimit)
      }
    }
  }

  async getMyPTServiceList(pt_user_id: string, limit: number, page: number, search?: string) {
    if (!ObjectId.isValid(pt_user_id)) {
      throw new ErrorWithStatus({
        message: 'ID khong hop le',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const safeLimit = Math.max(1, Number(limit) || 10)
    const safePage = Math.max(1, Number(page) || 1)
    const skip = (safePage - 1) * safeLimit

    await this.assertPTCanManageServices(pt_user_id)

    const query = (search || '').trim()
    const filter: Record<string, any> = {
      ptId: new ObjectId(pt_user_id)
    }

    if (query) {
      filter.title = { $regex: query, $options: 'i' }
    }

    const [services, total] = await Promise.all([
      databaseService.ptServices.find(filter).skip(skip).limit(safeLimit).sort({ createdAt: -1 }).toArray(),
      databaseService.ptServices.countDocuments(filter)
    ])

    return {
      services,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: Math.ceil(total / safeLimit)
      }
    }
  }

  async getPTServiceById(service_id: string) {
    if (!ObjectId.isValid(service_id)) {
      throw new ErrorWithStatus({
        message: 'PT service id không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const service = await databaseService.ptServices.findOne({
      _id: new ObjectId(service_id),
      isActive: true
    })

    if (!service) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy gói dịch vụ PT',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return service
  }

  async getServicesByPTId(pt_id: string, limit = 10, page = 1) {
    if (!ObjectId.isValid(pt_id)) {
      throw new ErrorWithStatus({
        message: 'PT id không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const safeLimit = Math.max(1, Number(limit) || 10)
    const safePage = Math.max(1, Number(page) || 1)
    const skip = (safePage - 1) * safeLimit

    const filter = {
      ptId: new ObjectId(pt_id),
      isActive: true
    }

    const [services, total] = await Promise.all([
      databaseService.ptServices.find(filter).skip(skip).limit(safeLimit).sort({ createdAt: -1 }).toArray(),
      databaseService.ptServices.countDocuments(filter)
    ])

    return {
      services,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        total_pages: Math.ceil(total / safeLimit)
      }
    }
  }

  async createPTService(
    requester_user_id: string,
    payload: {
    ptId?: string
    title: string
    description: string
    price: number
    sessions: number
    durationDays: number
    isActive?: boolean
    }
  ) {
    if (!ObjectId.isValid(requester_user_id)) {
      throw new ErrorWithStatus({
        message: 'User id không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const requester = await databaseService.users.findOne(
      { _id: new ObjectId(requester_user_id) },
      { projection: { role: 1 } }
    )

    if (!requester) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy người dùng',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    let resolvedPTId: ObjectId

    if (requester.role === UserRole.PT) {
      await this.assertPTCanManageServices(requester_user_id)
      resolvedPTId = new ObjectId(requester_user_id)
    } else if (requester.role === UserRole.ADMIN) {
      if (!payload.ptId || !ObjectId.isValid(payload.ptId)) {
        throw new ErrorWithStatus({
          message: 'PT id không hợp lệ',
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      const ptUser = await databaseService.users.findOne({
        _id: new ObjectId(payload.ptId),
        role: UserRole.PT
      })

      if (!ptUser) {
        throw new ErrorWithStatus({
          message: 'Không tìm thấy tài khoản PT',
          status: HTTP_STATUS.NOT_FOUND
        })
      }

      resolvedPTId = new ObjectId(payload.ptId)
    } else {
      throw new ErrorWithStatus({
        message: 'Bạn không có quyền thực hiện thao tác này',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const service = new PTService({
      ptId: resolvedPTId,
      title: payload.title.trim(),
      description: payload.description.trim(),
      price: payload.price,
      sessions: payload.sessions,
      durationDays: payload.durationDays,
      isActive: payload.isActive ?? true
    })

    const result = await databaseService.ptServices.insertOne(service)

    return {
      _id: result.insertedId,
      ...service
    }
  }

  async updatePTService(
    requester_user_id: string, // ID của người đang gọi API
    service_id: string,
    payload: Partial<{
      title: string
      description: string
      price: number
      sessions: number
      durationDays: number
      isActive: boolean
    }>
  ) {
    if (!ObjectId.isValid(service_id) || !ObjectId.isValid(requester_user_id)) {
      throw new ErrorWithStatus({ message: 'ID không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }

    // 1. Tìm gói dịch vụ và User đang request
    const service = await databaseService.ptServices.findOne({ _id: new ObjectId(service_id) })
    if (!service) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy gói dịch vụ PT', status: HTTP_STATUS.NOT_FOUND })
    }

    const requester = await databaseService.users.findOne({ _id: new ObjectId(requester_user_id) })

    // 2. Kiểm tra quyền: Chỉ Admin HOẶC chính PT chủ sở hữu mới được sửa
    if (requester?.role !== UserRole.ADMIN && service.ptId.toString() !== requester_user_id) {
      throw new ErrorWithStatus({
        message: 'Bạn không có quyền chỉnh sửa gói dịch vụ của người khác',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (requester?.role === UserRole.PT) {
      await this.assertPTCanManageServices(requester_user_id)
    }

    // 3. Thực hiện update
    const updateData: Record<string, any> = {}
    if (payload.title !== undefined) updateData.title = payload.title.trim()
    if (payload.description !== undefined) updateData.description = payload.description.trim()
    if (payload.price !== undefined) updateData.price = payload.price
    if (payload.sessions !== undefined) updateData.sessions = payload.sessions
    if (payload.durationDays !== undefined) updateData.durationDays = payload.durationDays
    if (payload.isActive !== undefined) updateData.isActive = payload.isActive

    const updated = await databaseService.ptServices.findOneAndUpdate(
      { _id: new ObjectId(service_id) },
      { $set: updateData, $currentDate: { updatedAt: true } },
      { returnDocument: 'after' }
    )

    return updated
  }

  async deletePTService(requester_user_id: string, service_id: string) {
    if (!ObjectId.isValid(service_id) || !ObjectId.isValid(requester_user_id)) {
      throw new ErrorWithStatus({ message: 'ID không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }

    const service = await databaseService.ptServices.findOne({ _id: new ObjectId(service_id) })
    if (!service) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy gói dịch vụ PT', status: HTTP_STATUS.NOT_FOUND })
    }

    const requester = await databaseService.users.findOne({ _id: new ObjectId(requester_user_id) })

    // Kiểm tra quyền: Chỉ Admin HOẶC chính PT chủ sở hữu mới được xóa
    if (requester?.role !== UserRole.ADMIN && service.ptId.toString() !== requester_user_id) {
      throw new ErrorWithStatus({
        message: 'Bạn không có quyền xóa gói dịch vụ của người khác',
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (requester?.role === UserRole.PT) {
      await this.assertPTCanManageServices(requester_user_id)
    }

    const updated = await databaseService.ptServices.findOneAndUpdate(
      { _id: new ObjectId(service_id) },
      { $set: { isActive: false }, $currentDate: { updatedAt: true } },
      { returnDocument: 'after' }
    )

    return {
      message: 'Ẩn gói dịch vụ PT thành công',
      result: updated
    }
  }

  async getPTClients(pt_user_id: string) {
    if (!ObjectId.isValid(pt_user_id)) {
      throw new ErrorWithStatus({ message: 'ID không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }

    // 1. Kiểm tra xem người gọi API có đúng là PT không
    const ptUser = await databaseService.users.findOne({ _id: new ObjectId(pt_user_id) })
    if (!ptUser || ptUser.role !== UserRole.PT) {
      throw new ErrorWithStatus({ 
        message: 'Chỉ có Personal Trainer (PT) mới được xem danh sách học viên', 
        status: HTTP_STATUS.FORBIDDEN 
      })
    }

    // 2. Tìm tất cả các gói dịch vụ thuộc sở hữu của PT này
    const myServices = await databaseService.ptServices
      .find({ ptId: new ObjectId(pt_user_id) })
      .toArray()

    const myServiceIds = myServices.map(service => service._id)

    // Nếu PT chưa tạo gói nào, chắc chắn chưa có học viên
    if (myServiceIds.length === 0) {
      return []
    }

    // 3. Tìm các User có ID gói tập của PT nằm trong mảng registeredPTServices
    const clients = await databaseService.users
      .find(
        { 
          $or: [
            { registeredPTServices: { $in: myServiceIds } }, // Bắt form cũ
            { 'registeredPTServices.serviceId': { $in: myServiceIds } } // Bắt form mới chứa Object
          ]
        },
        { 
          projection: { 
            password: 0, 
            forgot_password_token: 0, 
            loginAttempts: 0,
            locked_until: 0,
            notifications: 0,
            weightTracking: 0,
            calorieTracking: 0 
          } 
        }
      )
      .toArray()

    return clients
  }

  async checkInClientSession(pt_user_id: string, client_id: string, service_id: string) {
    await this.assertPTCanManageServices(pt_user_id)

    if (!ObjectId.isValid(client_id) || !ObjectId.isValid(service_id)) {
      throw new ErrorWithStatus({ message: 'ID không hợp lệ', status: HTTP_STATUS.BAD_REQUEST })
    }

    const clientObjectId = new ObjectId(client_id)
    const serviceObjectId = new ObjectId(service_id)

    // 1. Kiểm tra gói dịch vụ này có phải của PT này không
    const service = await databaseService.ptServices.findOne({ _id: serviceObjectId, ptId: new ObjectId(pt_user_id) })
    if (!service) {
      throw new ErrorWithStatus({ message: 'Bạn không có quyền thao tác trên gói dịch vụ này', status: HTTP_STATUS.FORBIDDEN })
    }

    // 2. Tìm khách hàng và lấy thông tin gói họ đang đăng ký
    const client = await databaseService.users.findOne({ _id: clientObjectId })
    const registration = client?.registeredPTServices?.find(
      (reg: any) => reg.serviceId.toString() === service_id
    ) as any

    if (!registration) {
      throw new ErrorWithStatus({ message: 'Học viên chưa đăng ký gói tập này', status: HTTP_STATUS.BAD_REQUEST })
    }

    if (registration.remainingSessions <= 0) {
      throw new ErrorWithStatus({ message: 'Gói tập này đã hết số buổi', status: HTTP_STATUS.BAD_REQUEST })
    }

    // 3. Thực hiện trừ đi 1 buổi
    await databaseService.users.updateOne(
      { 
        _id: clientObjectId, 
        'registeredPTServices.serviceId': serviceObjectId 
      },
      {
        $inc: { 'registeredPTServices.$.remainingSessions': -1 }
      }
    )

    return {
      message: `Check-in thành công. Học viên còn ${registration.remainingSessions - 1} buổi.`
    }
  }
}

const ptService = new PTServiceLayer()
export default ptService
