import { config } from 'dotenv'
import { ObjectId } from 'mongodb'
import { TokenType } from '~/constants/enums'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import { LoginReqBody, RegisterReqBody, UpdateMeReqBody, UpdatePTProfileReqBody } from '~/models/requests/User.request'
import Food from '~/models/schemas/Food.schema'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import User, {
  AccountStatus,
  ActivityLevel,
  HealthGoal,
  HealthProfile,
  PTProfile,
  UserRole
} from '~/models/schemas/User.schema'
import databaseService from '~/services/database.services'
import { hashPassword } from '~/utils/crypto'
import { signToken, verifyToken } from '~/utils/jwt'
import { SignOptions } from 'jsonwebtoken'

config()

const MAX_LOGIN_ATTEMPTS = 5
const ACCOUNT_LOCK_MINUTES = 5
const REMEMBER_ME_SECONDS = 30 * 24 * 60 * 60

const parseExpiresIn = (value: string | undefined, fallbackSeconds: number): SignOptions['expiresIn'] => {
  if (!value || value.trim() === '') return fallbackSeconds
  const normalized = value.trim()
  const asNumber = Number(normalized)
  return Number.isNaN(asNumber) ? (normalized as SignOptions['expiresIn']) : asNumber
}

type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  Sedentary: 1.2,
  Light: 1.375,
  Moderate: 1.55,
  Active: 1.725,
  'Very Active': 1.9
}

const MACRO_RATIOS: Record<HealthGoal, { protein: number; carb: number; fat: number }> = {
  LoseFat: { protein: 0.4, carb: 0.3, fat: 0.3 },
  GainMuscle: { protein: 0.3, carb: 0.45, fat: 0.25 },
  MaintainWeight: { protein: 0.3, carb: 0.4, fat: 0.3 }
}

const MEAL_CALORIE_RATIOS: Record<MealSlot, number> = {
  Breakfast: 0.25,
  Lunch: 0.35,
  Dinner: 0.3,
  Snack: 0.1
}

class UsersService {
  private normalizeRules(rules?: string[]) {
    return Array.from(
      new Set(
        (rules || [])
          .flatMap((rule) => rule.split(/[,/]|\s+\/\s+/g))
          .map((rule) => rule.trim().toLowerCase())
          .filter(Boolean)
      )
    )
  }

  private calculateHealthMetrics(profile: {
    gender: 'Male' | 'Female'
    age: number
    heightCm: number
    weightKg: number
    activityLevel: ActivityLevel
    goal: HealthGoal
  }) {
    const bmrRaw =
      profile.gender === 'Male'
        ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
        : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161

    const tdeeRaw = bmrRaw * ACTIVITY_MULTIPLIERS[profile.activityLevel]
    let targetCaloriesRaw = tdeeRaw

    if (profile.goal === 'LoseFat') {
      targetCaloriesRaw = tdeeRaw - 500
    } else if (profile.goal === 'GainMuscle') {
      targetCaloriesRaw = tdeeRaw + 300
    }

    const targetCalories = Math.max(1200, Math.round(targetCaloriesRaw))
    const macroRatio = MACRO_RATIOS[profile.goal]

    return {
      bmr: Math.round(bmrRaw),
      tdee: Math.round(tdeeRaw),
      targetCalories,
      macroDistribution: {
        protein: Math.round((targetCalories * macroRatio.protein) / 4),
        carb: Math.round((targetCalories * macroRatio.carb) / 4),
        fat: Math.round((targetCalories * macroRatio.fat) / 9)
      }
    }
  }

  private isFoodAllowed(food: Food, restrictions: string[]) {
    if (restrictions.length === 0) return true

    const source = [
      ...food.tags,
      ...food.ingredients.map((ingredient) => ingredient.name),
      ...food.ingredients.flatMap((ingredient) => ingredient.allergyTags)
    ]
      .join(' | ')
      .toLowerCase()

    const hasVeganConstraint = restrictions.some((rule) => ['vegan', 'ăn chay', 'an chay'].includes(rule))
    if (hasVeganConstraint && !food.tags.some((tag) => tag.toLowerCase().includes('vegan'))) {
      return false
    }

    return !restrictions.some((rule) => source.includes(rule))
  }

  private buildMealPlanForDay(foods: Food[], targetCalories: number) {
    const used = new Set<string>()

    const meals = (Object.keys(MEAL_CALORIE_RATIOS) as MealSlot[]).map((slot) => {
      const slotTargetCalories = Math.round(targetCalories * MEAL_CALORIE_RATIOS[slot])

      const candidates = foods.filter((food) => !used.has(String(food._id)))
      const pool = candidates.length > 0 ? candidates : foods
      const selected = [...pool].sort(
        (a, b) => Math.abs(a.calories - slotTargetCalories) - Math.abs(b.calories - slotTargetCalories)
      )[0]

      if (selected?._id) {
        used.add(String(selected._id))
      }

      return {
        slot,
        targetCalories: slotTargetCalories,
        food: selected
          ? {
              _id: selected._id,
              name: selected.name,
              calories: selected.calories,
              price: selected.price,
              nutrition: selected.nutrition,
              images: selected.images
            }
          : null
      }
    })

    const totalCalories = meals.reduce((sum, meal) => sum + (meal.food?.calories || 0), 0)

    return {
      meals,
      totalCalories,
      targetCalories,
      deltaCalories: totalCalories - targetCalories
    }
  }

  private buildGoalKeywords(goal: HealthGoal) {
    if (goal === 'LoseFat') {
      return ['lose fat', 'weight loss', 'fat loss', 'đốt mỡ', 'giam mo', 'giam can']
    }

    if (goal === 'GainMuscle') {
      return ['gain muscle', 'hypertrophy', 'strength', 'tăng cơ', 'tang co']
    }

    return ['maintain', 'wellness', 'fitness tổng quát', 'general fitness', 'sức khỏe']
  }

  private getDefaultRefreshTokenExpiresIn() {
    return parseExpiresIn(process.env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60)
  }

  private signAccessToken({ user_id, status }: { user_id: string; status: AccountStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.AccessToken,
        status
      },
      privateKey: process.env.JWT_SECRET_ACCESS_TOKEN as string,
      options: {
        expiresIn: parseExpiresIn(process.env.ACCESS_TOKEN_EXPIRES_IN, 60 * 15)
      }
    })
  }

  private signRefreshToken({
    user_id,
    status,
    exp,
    remember_me
  }: {
    user_id: string
    status: AccountStatus
    exp?: number
    remember_me?: boolean
  }) {
    if (exp) {
      return signToken({
        payload: {
          user_id,
          token_type: TokenType.RefreshToken,
          status,
          exp
        },
        privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
      })
    }

    return signToken({
      payload: {
        user_id,
        token_type: TokenType.RefreshToken,
        status
      },
      privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string,
      options: {
        expiresIn: remember_me ? REMEMBER_ME_SECONDS : this.getDefaultRefreshTokenExpiresIn()
      }
    })
  }

  private signForgotPasswordToken({ user_id, status }: { user_id: string; status: AccountStatus }) {
    return signToken({
      payload: {
        user_id,
        token_type: TokenType.ForgotPasswordToken,
        status
      },
      privateKey: process.env.JWT_SECRET_FORGOT_PASSWORD_TOKEN as string,
      options: {
        // Link reset password 15 phút
        expiresIn: 15 * 60
      }
    })
  }

  private signAccessAndRefreshToken({
    user_id,
    status,
    remember_me
  }: {
    user_id: string
    status: AccountStatus
    remember_me?: boolean
  }) {
    return Promise.all([
      this.signAccessToken({ user_id, status }),
      this.signRefreshToken({ user_id, status, remember_me })
    ])
  }

  private decodeRefreshToken(refresh_token: string) {
    return verifyToken({
      token: refresh_token,
      secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
    })
  }

  private async saveRefreshToken(user_id: ObjectId, refresh_token: string) {
    const { iat, exp } = await this.decodeRefreshToken(refresh_token)
    await databaseService.refreshTokens.insertOne(new RefreshToken({ user_id, token: refresh_token, iat, exp }))
  }

  async checkEmailExist(email: string) {
    const user = await databaseService.users.findOne({ email: email.toLowerCase().trim() })
    return Boolean(user)
  }

  async checkUsernameExist(username: string) {
    const user = await databaseService.users.findOne({ username: username.trim() })
    return Boolean(user)
  }

  async register(payload: RegisterReqBody) {
    const user_id = new ObjectId()
    const role = payload.role || UserRole.CUSTOMER
    // PT mặc định sẽ có trạng thái pending, cần admin duyệt mới active để đăng nhập được
    const account_status = role === UserRole.PT ? AccountStatus.PENDING : AccountStatus.ACTIVE
    const username = payload.username.trim()

    await databaseService.users.insertOne(
      new User({
        _id: user_id,
        email: payload.email.toLowerCase().trim(),
        username,
        password: hashPassword(payload.password),
        phone: payload.phone,
        role,
        account_status,
        loginAttempts: 0,
        forgot_password_token: '',
        healthProfile: payload.healthProfile,
        ptProfile: payload.ptProfile,
        notifications: [],
        weightTracking: [],
        calorieTracking: [],
        registeredPTServices: []
      })
    )

    // PT cần chờ duyệt, chưa cấp token đăng nhập
    if (role === UserRole.PT) {
      return {
        requires_approval: true,
        message: USERS_MESSAGES.PT_SUCCESSFULLY_REGISTERED
      }
    }

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user_id.toString(),
      status: AccountStatus.ACTIVE
    })

    await this.saveRefreshToken(user_id, refresh_token)

    return {
      access_token,
      refresh_token,
      role: UserRole.CUSTOMER
    }
  }

  async refreshToken({
    user_id,
    status,
    refresh_token,
    exp
  }: {
    user_id: string
    status: AccountStatus
    refresh_token: string
    exp: number
  }) {
    const [new_access_token, new_refresh_token] = await Promise.all([
      this.signAccessToken({ user_id, status }),
      this.signRefreshToken({ user_id, status, exp }),
      databaseService.refreshTokens.deleteOne({ token: refresh_token })
    ])

    const decoded_refresh_token = await this.decodeRefreshToken(new_refresh_token)
    await databaseService.refreshTokens.insertOne(
      new RefreshToken({
        user_id: new ObjectId(user_id),
        token: new_refresh_token,
        iat: decoded_refresh_token.iat,
        exp: decoded_refresh_token.exp
      })
    )

    return {
      access_token: new_access_token,
      refresh_token: new_refresh_token
    }
  }

  private async handleFailedLogin(user: User & { _id: ObjectId }) {
    const nextAttempts = (user.loginAttempts || 0) + 1

    if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000)
      await databaseService.users.updateOne(
        { _id: user._id },
        {
          $set: {
            account_status: AccountStatus.LOCKED,
            locked_until: lockedUntil,
            loginAttempts: 0
          },
          $currentDate: { updated_at: true }
        }
      )
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.TOO_MANY_LOGIN_ATTEMPTS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.users.updateOne(
      { _id: user._id },
      {
        $set: { loginAttempts: nextAttempts },
        $currentDate: { updated_at: true }
      }
    )

    throw new ErrorWithStatus({
      message: USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
      status: HTTP_STATUS.UNAUTHORIZED
    })
  }

  async login(payload: LoginReqBody) {
    const identifier = (payload.identifier || payload.email || '').trim()
    const user = await databaseService.users.findOne({
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
    })

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // PT chưa duyệt không cho đăng nhập
    if (user.role === UserRole.PT && user.account_status === AccountStatus.PENDING) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.PT_ACCOUNT_PENDING_APPROVAL,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (user.account_status === AccountStatus.LOCKED && user.locked_until && user.locked_until > new Date()) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ACCOUNT_IS_TEMPORARILY_LOCKED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (hashPassword(payload.password) !== user.password) {
      return this.handleFailedLogin(user as User & { _id: ObjectId })
    }

    // Mở khóa nếu đã quá thời gian lock và reset login attempts
    await databaseService.users.updateOne(
      { _id: user._id },
      {
        $set: {
          loginAttempts: 0,
          account_status:
            user.account_status === AccountStatus.LOCKED
              ? user.role === UserRole.PT
                ? AccountStatus.PENDING
                : AccountStatus.ACTIVE
              : user.account_status
        },
        $unset: { locked_until: '' },
        $currentDate: { updated_at: true }
      }
    )

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user._id!.toString(),
      status:
        user.account_status === AccountStatus.LOCKED
          ? user.role === UserRole.PT
            ? AccountStatus.PENDING
            : AccountStatus.ACTIVE
          : user.account_status,
      remember_me: payload.remember_me
    })

    await this.saveRefreshToken(user._id as ObjectId, refresh_token)

    return {
      access_token,
      refresh_token,
      role: user.role
    }
  }

  async logout(refresh_token: string) {
    console.log('Logging out, deleting refresh token:', refresh_token)
    await databaseService.refreshTokens.deleteOne({ token: refresh_token })
    return {
      message: USERS_MESSAGES.LOGOUT_SUCCESS
    }
  }

  async forgotPasswordByEmail(email: string) {
    const user = await databaseService.users.findOne({ email: email.toLowerCase().trim() })
    if (!user) {
      // Trả generic message để tránh lộ email tồn tại hay không
      return {
        message: USERS_MESSAGES.CHECK_EMAIL_TO_RESET_PASSWORD
      }
    }

    const forgot_password_token = await this.signForgotPasswordToken({
      user_id: user._id!.toString(),
      status: user.account_status
    })

    await databaseService.users.updateOne(
      { _id: user._id },
      {
        $set: {
          forgot_password_token
        },
        $currentDate: { updated_at: true }
      }
    )

    return {
      message: USERS_MESSAGES.CHECK_EMAIL_TO_RESET_PASSWORD,
      forgot_password_token
    }
  }

  async resetPassword({
    user_id,
    password,
    forgot_password_token
  }: {
    user_id: string
    password: string
    forgot_password_token: string
  }) {
    const user = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

    if (!user || !user.forgot_password_token || user.forgot_password_token !== forgot_password_token) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.RESET_PASSWORD_TOKEN_IS_INVALID_OR_USED,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    await databaseService.users.updateOne(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          forgot_password_token: '',
          password: hashPassword(password)
        },
        $currentDate: {
          updated_at: true
        }
      }
    )

    return {
      message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
    }
  }

  async getMe(user_id: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      {
        projection: {
          password: 0,
          forgot_password_token: 0
        }
      }
    )
    return user
  }

  async getProfile(username: string) {
    const user = await databaseService.users.findOne(
      { username },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          created_at: 0,
          updated_at: 0
        }
      }
    )

    if (user === null) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user
  }

  async getAllUsers() {
    return databaseService.users
      .find(
        {}, 
        { projection: { password: 0, forgot_password_token: 0 } } // Không trả về mật khẩu
      )
      .sort({ created_at: -1 })
      .toArray()
  }

  async approvePTAccount(targetUserId: string) {
    if (!ObjectId.isValid(targetUserId)) {
      throw new ErrorWithStatus({
        message: 'ID người dùng không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const targetObjectId = new ObjectId(targetUserId)

    const user = await databaseService.users.findOne({ _id: targetObjectId })
    if (!user) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy người dùng này', status: HTTP_STATUS.NOT_FOUND })
    }

    if (user.role !== 'PT') { // Nhớ dùng UserRole.PT nếu bạn có import enum
      throw new ErrorWithStatus({ message: 'Người dùng này không phải là PT', status: HTTP_STATUS.BAD_REQUEST })
    }

    const nextPTProfile: PTProfile = {
      experienceYears: user.ptProfile?.experienceYears ?? 0,
      specialties: user.ptProfile?.specialties ?? [],
      rating: user.ptProfile?.rating ?? 0,
      portfolioImages: user.ptProfile?.portfolioImages ?? [],
      approvedByAdmin: true
    }

    // Đảm bảo ptProfile luôn là object hợp lệ để tránh lỗi khi profile cũ bị null
    await databaseService.users.updateOne(
      { _id: targetObjectId },
      { 
        $set: { 
          account_status: AccountStatus.ACTIVE,
          ptProfile: nextPTProfile
        },
        $currentDate: { updated_at: true } 
      }
    )

    return { message: 'Duyệt tài khoản PT thành công' }
  }

  async updateMe(user_id: string, payload: UpdateMeReqBody) {
    const safePayload: { username?: string; phone?: string; date_of_birth?: Date; avatar?: string } = {}
    const unsetPayload: { avatar?: '' } = {}

    if (typeof payload.username === 'string') {
      safePayload.username = payload.username.trim()
    }

    if (typeof payload.phone === 'string') {
      safePayload.phone = payload.phone.trim()
    }

    if (typeof payload.date_of_birth === 'string') {
      safePayload.date_of_birth = new Date(payload.date_of_birth)
    }

    if (payload.avatar === null || payload.avatar === '') {
      unsetPayload.avatar = ''
    } else if (typeof payload.avatar === 'string') {
      const normalizedAvatar = payload.avatar.trim()
      if (normalizedAvatar.length > 0) {
        safePayload.avatar = normalizedAvatar
      }
    }

    const updateDoc: {
      $set: typeof safePayload
      $currentDate: { updated_at: true }
      $unset?: typeof unsetPayload
    } = {
      $set: {
        ...safePayload
      },
      $currentDate: {
        updated_at: true
      }
    }

    if (Object.keys(unsetPayload).length > 0) {
      updateDoc.$unset = unsetPayload
    }

    const updatedUser = await databaseService.users.findOneAndUpdate(
      {
        _id: new ObjectId(user_id)
      },
      updateDoc,
      {
        returnDocument: 'after',
        projection: {
          password: 0,
          forgot_password_token: 0
        }
      }
    )

    return updatedUser
  }

  async updatePTProfile(user_id: string, payload: UpdatePTProfileReqBody) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { role: 1, ptProfile: 1 } }
    )

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (user.role !== UserRole.PT) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ONLY_PT_CAN_UPDATE_PT_PROFILE,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const nextPTProfile: PTProfile = {
      experienceYears: payload.experienceYears ?? user.ptProfile?.experienceYears ?? 0,
      specialties: payload.specialties?.map((item) => item.trim()).filter(Boolean) ?? user.ptProfile?.specialties ?? [],
      rating: user.ptProfile?.rating ?? 0,
      portfolioImages:
        payload.portfolioImages?.map((item) => item.trim()).filter(Boolean) ?? user.ptProfile?.portfolioImages ?? [],
      approvedByAdmin: user.ptProfile?.approvedByAdmin ?? false
    }

    const updatedUser = await databaseService.users.findOneAndUpdate(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          ptProfile: nextPTProfile
        },
        $currentDate: {
          updated_at: true
        }
      },
      {
        returnDocument: 'after',
        projection: {
          password: 0,
          forgot_password_token: 0
        }
      }
    )

    return updatedUser
  }

  async updateUserStatus(targetUserId: string, status: AccountStatus) {
    if (!ObjectId.isValid(targetUserId)) {
      throw new ErrorWithStatus({
        message: 'ID người dùng không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const targetObjectId = new ObjectId(targetUserId)

    const user = await databaseService.users.findOne({ _id: targetObjectId })
    if (!user) {
      throw new ErrorWithStatus({
        message: 'Không tìm thấy người dùng này',
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Không cho phép Admin tự khóa chính mình
    if (user.role === UserRole.ADMIN && status === AccountStatus.LOCKED) {
      throw new ErrorWithStatus({
        message: 'Không thể khóa tài khoản Admin',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.users.updateOne(
      { _id: targetObjectId },
      { 
        $set: { account_status: status }, 
        $currentDate: { updated_at: true } 
      }
    )

    return {
      message: `Cập nhật trạng thái tài khoản thành ${status} thành công`
    }
  }

  async registerPTService(user_id: string, service_id: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { role: 1, registeredPTServices: 1 } }
    )

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (user.role !== UserRole.CUSTOMER) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ONLY_CUSTOMER_CAN_REGISTER_PT_SERVICE,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const ptService = await databaseService.ptServices.findOne({ _id: new ObjectId(service_id) })
    if (!ptService || !ptService.isActive) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.PT_SERVICE_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    type RegisteredServiceRaw = ObjectId | { serviceId: ObjectId | string }
    const registeredRaw = (user.registeredPTServices || []) as RegisteredServiceRaw[]

    const registeredServiceIds = registeredRaw
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'serviceId' in item) {
          return String(item.serviceId)
        }
        return String(item)
      })
      .filter(Boolean)

    if (registeredServiceIds.includes(String(ptService._id))) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.PT_SERVICE_ALREADY_REGISTERED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.users.updateOne(
      { _id: new ObjectId(user_id) },
      {
        $push: {
          registeredPTServices: {
            serviceId: ptService._id,
            remainingSessions: ptService.sessions, // Gán số buổi ban đầu
            totalSessions: ptService.sessions,
            registeredAt: new Date()
          } as any // Ép kiểu tạm nếu schema TS báo lỗi
        },
        $currentDate: { updated_at: true }
      }
    )

    return {
      message: USERS_MESSAGES.PT_SERVICE_REGISTERED_SUCCESS,
      result: ptService
    }
  }

  async getMyRegisteredPTServices(user_id: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { role: 1, registeredPTServices: 1 } }
    )

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (user.role !== UserRole.CUSTOMER) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ONLY_CUSTOMER_CAN_REGISTER_PT_SERVICE,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    type RegisteredServiceRaw =
      | ObjectId
      | {
          serviceId: ObjectId | string
          remainingSessions?: number
          totalSessions?: number
          registeredAt?: Date
        }

    const registeredRaw = (user.registeredPTServices || []) as RegisteredServiceRaw[]

    const normalizedRegistrations = registeredRaw
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'serviceId' in item) {
          return {
            serviceId: String(item.serviceId),
            remainingSessions: Number(item.remainingSessions ?? 0),
            totalSessions: Number(item.totalSessions ?? 0),
            registeredAt: item.registeredAt
          }
        }

        return {
          serviceId: String(item),
          remainingSessions: 0,
          totalSessions: 0,
          registeredAt: undefined
        }
      })
      .filter((item) => Boolean(item.serviceId))

    if (normalizedRegistrations.length === 0) {
      return {
        services: []
      }
    }

    const serviceObjectIds = normalizedRegistrations
      .filter((item) => ObjectId.isValid(item.serviceId))
      .map((item) => new ObjectId(item.serviceId))

    if (serviceObjectIds.length === 0) {
      return {
        services: []
      }
    }

    const services = await databaseService.ptServices.find({ _id: { $in: serviceObjectIds } }).toArray()

    const serviceMap = new Map(services.map((service) => [String(service._id), service]))
    const orderedServices = normalizedRegistrations
      .map((registration) => {
        const service = serviceMap.get(registration.serviceId)
        if (!service) return null

        return {
          ...service,
          remainingSessions: registration.remainingSessions,
          totalSessions: registration.totalSessions,
          registeredAt: registration.registeredAt
        }
      })
      .filter((service) => Boolean(service))

    return {
      services: orderedServices
    }
  }

  async changePassword(user_id: string, new_password: string) {
    await databaseService.users.updateOne(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          password: hashPassword(new_password)
        },
        $currentDate: {
          updated_at: true
        }
      }
    )

    return {
      message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS
    }
  }

  async upsertHealthProfile(
    user_id: string,
    payload: {
      gender: 'Male' | 'Female'
      age: number
      heightCm: number
      weightKg: number
      activityLevel: ActivityLevel
      goal: HealthGoal
      allergies?: string[]
    }
  ) {
    const allergies = this.normalizeRules(payload.allergies)
    const metrics = this.calculateHealthMetrics(payload)

    const healthProfile: HealthProfile = {
      ...payload,
      allergies,
      ...metrics
    }

    const updated = await databaseService.users.findOneAndUpdate(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          healthProfile
        },
        $currentDate: { updated_at: true }
      },
      {
        returnDocument: 'after',
        projection: {
          password: 0,
          forgot_password_token: 0
        }
      }
    )

    return {
      profile: updated?.healthProfile,
      metrics
    }
  }

  async getHealthMetrics(user_id: string) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { healthProfile: 1 } }
    )

    if (!user?.healthProfile) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.HEALTH_PROFILE_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return user.healthProfile
  }

  async recommendMeals(user_id: string, days: 1 | 7 = 1) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { healthProfile: 1 } }
    )

    if (!user?.healthProfile) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.HEALTH_PROFILE_REQUIRED_FOR_RECOMMENDATION,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const restrictions = this.normalizeRules(user.healthProfile.allergies)

    const activeFoods = await databaseService.foods
      .find({ isActive: true, stock: { $gt: 0 } })
      .project<Food>({
        _id: 1,
        name: 1,
        calories: 1,
        price: 1,
        nutrition: 1,
        images: 1,
        ingredients: 1,
        tags: 1,
        description: 1,
        stock: 1,
        isActive: 1
      })
      .toArray()

    const allowedFoods = activeFoods.filter((food) => this.isFoodAllowed(food, restrictions))
    if (allowedFoods.length === 0) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.NO_FOOD_MATCHES_RESTRICTIONS,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const targetCalories =
      user.healthProfile.targetCalories || this.calculateHealthMetrics(user.healthProfile).targetCalories

    const plans = Array.from({ length: days }).map((_, index) => {
      const date = new Date()
      date.setDate(date.getDate() + index)

      return {
        day: index + 1,
        date: date.toISOString().split('T')[0],
        ...this.buildMealPlanForDay(allowedFoods, targetCalories)
      }
    })

    return {
      days,
      targetCalories,
      restrictions,
      plans
    }
  }

  async swapRecommendedFood(user_id: string, current_food_id: string, target_calories?: number) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { healthProfile: 1 } }
    )

    if (!user?.healthProfile) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.HEALTH_PROFILE_REQUIRED_FOR_RECOMMENDATION,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const currentFood = await databaseService.foods.findOne({ _id: new ObjectId(current_food_id) })
    if (!currentFood) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.FOOD_ID_IS_INVALID,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const restrictions = this.normalizeRules(user.healthProfile.allergies)
    const expectedCalories = target_calories || currentFood.calories

    const candidates = await databaseService.foods
      .find({
        _id: { $ne: new ObjectId(current_food_id) },
        isActive: true,
        stock: { $gt: 0 }
      })
      .project<Food>({
        _id: 1,
        name: 1,
        calories: 1,
        price: 1,
        nutrition: 1,
        images: 1,
        ingredients: 1,
        tags: 1,
        description: 1,
        stock: 1,
        isActive: 1
      })
      .toArray()

    const nextFood = candidates
      .filter((food) => this.isFoodAllowed(food, restrictions))
      .sort((a, b) => Math.abs(a.calories - expectedCalories) - Math.abs(b.calories - expectedCalories))[0]

    if (!nextFood) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.NO_SWAP_CANDIDATE_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return {
      swappedFrom: {
        _id: currentFood._id,
        name: currentFood.name,
        calories: currentFood.calories
      },
      swappedTo: {
        _id: nextFood._id,
        name: nextFood.name,
        calories: nextFood.calories,
        price: nextFood.price,
        nutrition: nextFood.nutrition,
        images: nextFood.images
      },
      targetCalories: expectedCalories,
      calorieDelta: nextFood.calories - expectedCalories
    }
  }

  async recommendPTs(user_id: string, limit = 3) {
    const user = await databaseService.users.findOne(
      { _id: new ObjectId(user_id) },
      { projection: { healthProfile: 1 } }
    )

    if (!user?.healthProfile) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.HEALTH_PROFILE_REQUIRED_FOR_RECOMMENDATION,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const keywords = this.buildGoalKeywords(user.healthProfile.goal)

    const pts = await databaseService.users
      .find({
        role: UserRole.PT,
        account_status: AccountStatus.ACTIVE,
        'ptProfile.approvedByAdmin': true
      })
      .project<User & { ptProfile?: PTProfile }>({
        password: 0,
        forgot_password_token: 0
      })
      .toArray()

    const scored = pts
      .map((pt) => {
        const specialties = (pt.ptProfile?.specialties || []).map((item) => item.toLowerCase())
        const score = keywords.reduce(
          (sum, keyword) => sum + (specialties.some((specialty) => specialty.includes(keyword)) ? 1 : 0),
          0
        )
        return {
          ...pt,
          score
        }
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (b.ptProfile?.rating || 0) - (a.ptProfile?.rating || 0)
      })
      .slice(0, limit)

    return {
      goal: user.healthProfile.goal,
      suggestions: scored
    }
  }
}

const usersService = new UsersService()
export default usersService
