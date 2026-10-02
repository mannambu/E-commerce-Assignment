import { config } from 'dotenv'
import { ObjectId } from 'mongodb'
import { randomBytes, randomUUID } from 'node:crypto'
import { TokenType } from '~/constants/enums'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import { LoginReqBody, RegisterReqBody, UpdateMeReqBody, TokenPayload } from '~/models/requests/User.request'
import Food from '~/models/schemas/Food.schema'
import Session from '~/models/schemas/Session.schema'
import User, { AccountStatus, ActivityLevel, HealthGoal, HealthProfile, UserRole } from '~/models/schemas/User.schema'
import databaseService from '~/services/database.services'
import { hashPassword, hashToken, isLegacyPassword, verifyPassword } from '~/utils/crypto'
import emailService from './email.services'
import { signToken, verifyToken } from '~/utils/jwt'
import trackingService from './tracking.services'
import { calculateHealthMetrics } from '~/utils/health'
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

  private async signSessionTokens(user: User, sessionId: string, rememberMe = false, exp?: number) {
    const payload = {
      user_id: user._id!.toString(),
      role: user.role,
      status: user.account_status,
      sessionId,
      tokenVersion: user.tokenVersion ?? 0
    }
    const [access_token, refresh_token] = await Promise.all([
      signToken({
        payload: { ...payload, token_type: TokenType.AccessToken },
        privateKey: process.env.JWT_SECRET_ACCESS_TOKEN as string,
        options: { expiresIn: parseExpiresIn(process.env.ACCESS_TOKEN_EXPIRES_IN, 15 * 60) }
      }),
      signToken({
        payload: { ...payload, token_type: TokenType.RefreshToken, jti: randomUUID(), ...(exp ? { exp } : {}) },
        privateKey: process.env.JWT_SECRET_REFRESH_TOKEN as string,
        options: exp
          ? {}
          : {
              expiresIn: rememberMe
                ? REMEMBER_ME_SECONDS
                : parseExpiresIn(process.env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60)
            }
      })
    ])
    return { access_token, refresh_token }
  }

  private async createSession(user: User, rememberMe = false) {
    const sessionId = new ObjectId()
    const tokens = await this.signSessionTokens(user, sessionId.toString(), rememberMe)
    const { iat, exp } = await verifyToken({
      token: tokens.refresh_token,
      secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
    })
    await databaseService.sessions.insertOne(
      new Session({
        _id: sessionId,
        sessionId,
        user_id: user._id!,
        token: hashToken(tokens.refresh_token),
        tokenVersion: user.tokenVersion ?? 0,
        iat,
        exp
      })
    )
    return { ...tokens, role: user.role }
  }

  // Every protected request checks both the account and its login session.
  async validateSession(payload: TokenPayload, refreshToken?: string) {
    if (
      !ObjectId.isValid(payload.user_id || '') ||
      !ObjectId.isValid(payload.sessionId || '') ||
      !Number.isInteger(payload.tokenVersion) ||
      !payload.role
    ) {
      throw new ErrorWithStatus({ status: 401, message: 'Invalid or revoked session' })
    }
    const user = await databaseService.users.findOne({
      _id: new ObjectId(payload.user_id),
      account_status: AccountStatus.ACTIVE,
      role: { $in: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER] }
    })
    if (!user || user.role !== payload.role || (user.tokenVersion ?? 0) !== payload.tokenVersion) {
      throw new ErrorWithStatus({ status: 401, message: 'Invalid or revoked session' })
    }
    const session = await databaseService.sessions.findOne({
      sessionId: new ObjectId(payload.sessionId),
      user_id: user._id,
      tokenVersion: payload.tokenVersion,
      revoked_at: null,
      exp: { $gt: new Date() },
      ...(refreshToken ? { token: hashToken(refreshToken) } : {})
    })
    if (!session) throw new ErrorWithStatus({ status: 401, message: 'Invalid or revoked session' })
    return user
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
    const username = payload.username.trim()

    const user = new User({
      _id: user_id,
      email: payload.email.toLowerCase().trim(),
      username,
      password: await hashPassword(payload.password),
      phone: payload.phone,
      role: UserRole.CUSTOMER,
      account_status: AccountStatus.ACTIVE
    })
    await databaseService.users.insertOne(user)
    return this.createSession(user)
  }

  async refreshToken({ refresh_token }: { refresh_token: string }) {
    const decoded = await verifyToken({
      token: refresh_token,
      secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
    })
    if (decoded.token_type !== TokenType.RefreshToken)
      throw new ErrorWithStatus({ status: 401, message: 'Invalid refresh token' })
    const user = await this.validateSession(decoded, refresh_token)
    const tokens = await this.signSessionTokens(user, decoded.sessionId!, false, decoded.exp)
    // Compare-and-set: only one request can rotate the same refresh token.
    const result = await databaseService.sessions.updateOne(
      {
        sessionId: new ObjectId(decoded.sessionId),
        user_id: user._id,
        token: hashToken(refresh_token),
        revoked_at: null,
        exp: { $gt: new Date() }
      },
      { $set: { token: hashToken(tokens.refresh_token), last_used_at: new Date() } }
    )
    if (result.modifiedCount !== 1)
      throw new ErrorWithStatus({ status: 401, message: 'Refresh token already used or revoked' })
    return tokens
  }

  private async handleFailedLogin(user: User & { _id: ObjectId }) {
    // Increment in MongoDB to avoid losing simultaneous failed attempts.
    const updated = await databaseService.users.findOneAndUpdate(
      {
        _id: user._id,
        password: user.password,
        tokenVersion: user.tokenVersion ?? { $exists: false },
        account_status: user.account_status
      },
      { $inc: { loginAttempts: 1 }, $currentDate: { updated_at: true } },
      { returnDocument: 'after' }
    )
    if (updated && updated.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      await databaseService.users.updateOne(
        {
          _id: user._id,
          password: user.password,
          loginAttempts: { $gte: MAX_LOGIN_ATTEMPTS },
          tokenVersion: user.tokenVersion ?? { $exists: false }
        },
        {
          $set: {
            account_status: AccountStatus.LOCKED,
            locked_until: new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000),
            loginAttempts: 0
          },
          $inc: { tokenVersion: 1 },
          $currentDate: { updated_at: true }
        }
      )
      throw new ErrorWithStatus({ message: USERS_MESSAGES.TOO_MANY_LOGIN_ATTEMPTS, status: HTTP_STATUS.BAD_REQUEST })
    }
    throw new ErrorWithStatus({
      message: USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
      status: HTTP_STATUS.UNAUTHORIZED
    })
  }

  async login(payload: LoginReqBody) {
    const identifier = (payload.identifier || payload.email || '').trim()
    const user = await databaseService.users.findOne({
      role: { $in: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER] },
      $or: [{ email: identifier.toLowerCase() }, { username: identifier }]
    })

    if (!user) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    if (user.account_status === AccountStatus.LOCKED && !user.locked_until) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ACCOUNT_IS_LOCKED,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    if (user.account_status === AccountStatus.LOCKED && user.locked_until && user.locked_until > new Date()) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ACCOUNT_IS_TEMPORARILY_LOCKED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!(await verifyPassword(payload.password, user.password))) {
      return this.handleFailedLogin(user as User & { _id: ObjectId })
    }

    // Chỉ mở khóa tạm đã hết hạn; tài khoản bị Admin khóa đã bị chặn ở trên.
    const accountStatus = user.account_status === AccountStatus.LOCKED ? AccountStatus.ACTIVE : user.account_status
    if (accountStatus !== AccountStatus.ACTIVE) {
      throw new ErrorWithStatus({
        message: USERS_MESSAGES.ACCOUNT_IS_INACTIVE,
        status: HTTP_STATUS.FORBIDDEN
      })
    }

    const password = isLegacyPassword(user.password) ? await hashPassword(payload.password) : user.password
    // Do not overwrite a reset/lock that happened while password verification was running.
    const result = await databaseService.users.updateOne(
      {
        _id: user._id,
        password: user.password,
        account_status: user.account_status,
        tokenVersion: user.tokenVersion ?? { $exists: false }
      },
      {
        $set: { account_status: accountStatus, loginAttempts: 0, password },
        $unset: { locked_until: '' },
        $currentDate: { updated_at: true }
      }
    )
    if (!result.matchedCount) throw new ErrorWithStatus({ status: 401, message: 'Account changed; please login again' })
    return this.createSession({ ...user, password, account_status: accountStatus }, payload.remember_me)
  }

  async logout(refresh_token: string) {
    // Revocation stays on the same session even when refresh rotates its token.
    const decoded = await verifyToken({
      token: refresh_token,
      secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
    })
    if (decoded.token_type !== TokenType.RefreshToken || !ObjectId.isValid(decoded.sessionId || '')) {
      throw new ErrorWithStatus({ status: 401, message: 'Invalid refresh token' })
    }
    await databaseService.sessions.updateOne(
      { sessionId: new ObjectId(decoded.sessionId), user_id: new ObjectId(decoded.user_id) },
      { $set: { revoked_at: new Date() } }
    )
    return { message: USERS_MESSAGES.LOGOUT_SUCCESS }
  }

  async logoutAll(user_id: string) {
    await databaseService.withTransaction(async (session) => {
      await databaseService.users.updateOne({ _id: new ObjectId(user_id) }, { $inc: { tokenVersion: 1 } }, { session })
      await databaseService.sessions.deleteMany({ user_id: new ObjectId(user_id) }, { session })
    })
    return { message: USERS_MESSAGES.LOGOUT_SUCCESS }
  }

  async forgotPasswordByEmail(email: string) {
    // Check configuration before lookup, so an unconfigured server responds identically for every email.
    emailService.getResetConfig()
    const response = { message: USERS_MESSAGES.CHECK_EMAIL_TO_RESET_PASSWORD }
    const user = await databaseService.users.findOne({
      email: email.toLowerCase().trim(),
      role: { $in: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER] }
    })
    if (!user) return response
    const token = randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    const result = await databaseService.users.updateOne(
      {
        _id: user._id,
        $or: [
          { forgot_password_expires_at: { $exists: false } },
          { forgot_password_expires_at: null },
          { forgot_password_expires_at: { $lte: new Date(Date.now() + 14 * 60 * 1000) } }
        ]
      },
      {
        $set: { forgot_password_token: tokenHash, forgot_password_expires_at: new Date(Date.now() + 15 * 60 * 1000) },
        $currentDate: { updated_at: true }
      }
    )
    if (!result.modifiedCount) return response // At most one email per account per minute.
    try {
      await emailService.sendPasswordReset(user.email, user._id!.toString(), token)
    } catch {
      await databaseService.users.updateOne(
        { _id: user._id, forgot_password_token: tokenHash },
        {
          $set: { forgot_password_token: '' },
          $unset: { forgot_password_expires_at: '' }
        }
      )
      console.error('Password reset email failed; check SMTP configuration.')
    }
    return response
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
    const invalid = () =>
      new ErrorWithStatus({ status: 401, message: USERS_MESSAGES.RESET_PASSWORD_TOKEN_IS_INVALID_OR_USED })
    if (!ObjectId.isValid(user_id) || !/^[a-f0-9]{64}$/.test(forgot_password_token)) throw invalid()
    const tokenHash = hashToken(forgot_password_token)
    const userId = new ObjectId(user_id)
    const filter = { _id: userId, forgot_password_token: tokenHash, forgot_password_expires_at: { $gt: new Date() } }
    if (!(await databaseService.users.findOne(filter))) throw invalid()
    const passwordHash = await hashPassword(password)
    await databaseService.withTransaction(async (session) => {
      const result = await databaseService.users.updateOne(
        { ...filter, forgot_password_expires_at: { $gt: new Date() } },
        {
          $set: { password: passwordHash, forgot_password_token: '', password_changed_at: new Date() },
          $unset: { forgot_password_expires_at: '' },
          $inc: { tokenVersion: 1 },
          $currentDate: { updated_at: true }
        },
        { session }
      )
      if (result.modifiedCount !== 1) throw invalid()
      await databaseService.sessions.deleteMany({ user_id: userId }, { session })
    })
    return { message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS }
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
        { role: { $in: [UserRole.CUSTOMER, UserRole.ADMIN, UserRole.MANAGER] } },
        { projection: { password: 0, forgot_password_token: 0 } } // Không trả về mật khẩu
      )
      .sort({ created_at: -1 })
      .toArray()
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

  async createUser(actorId: string, payload: Omit<RegisterReqBody, 'role'> & { role: UserRole }) {
    const actor = await databaseService.users.findOne({
      _id: new ObjectId(actorId),
      role: UserRole.ADMIN,
      account_status: AccountStatus.ACTIVE
    })
    if (!actor || ![UserRole.CUSTOMER, UserRole.MANAGER].includes(payload.role)) {
      throw new ErrorWithStatus({ status: 403, message: USERS_MESSAGES.NOT_AUTHORIZED })
    }
    const user = new User({
      _id: new ObjectId(),
      email: payload.email.trim().toLowerCase(),
      username: payload.username.trim(),
      password: await hashPassword(payload.password),
      phone: payload.phone,
      role: payload.role
    })
    if (await databaseService.users.findOne({ $or: [{ email: user.email }, { username: user.username }] })) {
      throw new ErrorWithStatus({ status: 409, message: 'Email or username already exists' })
    }
    await databaseService.withTransaction(async (session) => {
      await databaseService.users.insertOne(user, { session })
      await databaseService.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: UserRole.ADMIN,
          action: 'UserCreated',
          entityType: 'User',
          entityId: user._id!,
          after: { email: user.email, role: user.role },
          reason: 'Admin created account',
          createdAt: new Date()
        },
        { session }
      )
    })
    return {
      _id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      account_status: user.account_status
    }
  }

  async updateUserStatus(targetUserId: string, status: AccountStatus, actorId: string) {
    if (!ObjectId.isValid(targetUserId) || ![AccountStatus.ACTIVE, AccountStatus.LOCKED].includes(status)) {
      throw new ErrorWithStatus({ status: 400, message: 'Invalid user or status' })
    }
    const actor = await databaseService.users.findOne({
      _id: new ObjectId(actorId),
      role: UserRole.ADMIN,
      account_status: AccountStatus.ACTIVE
    })
    if (!actor) throw new ErrorWithStatus({ status: 403, message: USERS_MESSAGES.NOT_AUTHORIZED })
    const userId = new ObjectId(targetUserId)
    await databaseService.withTransaction(async (session) => {
      const user = await databaseService.users.findOne({ _id: userId }, { session })
      if (!user) throw new ErrorWithStatus({ status: 404, message: USERS_MESSAGES.USER_NOT_FOUND })
      if (user.role === UserRole.ADMIN)
        throw new ErrorWithStatus({ status: 403, message: 'Cannot lock or modify an Admin account' })
      await databaseService.users.updateOne(
        { _id: userId },
        {
          $set: { account_status: status, loginAttempts: 0, forgot_password_token: '' },
          $unset: { locked_until: '', forgot_password_expires_at: '' },
          $inc: { tokenVersion: 1 },
          $currentDate: { updated_at: true }
        },
        { session }
      )
      await databaseService.sessions.deleteMany({ user_id: userId }, { session })
      await databaseService.auditLogs.insertOne(
        {
          actorId: actor._id,
          actorRole: UserRole.ADMIN,
          action: status === AccountStatus.LOCKED ? 'AccountLocked' : 'AccountUnlocked',
          entityType: 'User',
          entityId: userId,
          before: { account_status: user.account_status },
          after: { account_status: status },
          reason: 'Admin updated account status',
          createdAt: new Date()
        },
        { session }
      )
    })
    return { message: 'Account status updated' }
  }

  async changePassword(user_id: string, new_password: string) {
    const password = await hashPassword(new_password)
    await databaseService.withTransaction(async (session) => {
      await databaseService.users.updateOne(
        { _id: new ObjectId(user_id) },
        {
          $set: { password, forgot_password_token: '', password_changed_at: new Date() },
          $unset: { forgot_password_expires_at: '' },
          $inc: { tokenVersion: 1 },
          $currentDate: { updated_at: true }
        },
        { session }
      )
      await databaseService.sessions.deleteMany({ user_id: new ObjectId(user_id) }, { session })
    })
    return { message: USERS_MESSAGES.RESET_PASSWORD_SUCCESS }
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
    const metrics = calculateHealthMetrics(payload)

    const healthProfile: HealthProfile = {
      ...payload,
      allergies,
      ...metrics
    }

    await trackingService.saveHealthProfile(user_id, healthProfile, 'ProfileUpdate')
    const updated = await databaseService.users.findOne({ _id: new ObjectId(user_id) })

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
      user.healthProfile.targetCalories || calculateHealthMetrics(user.healthProfile).targetCalories

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
}

const usersService = new UsersService()
export default usersService
