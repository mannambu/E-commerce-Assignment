import { Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { ParamsDictionary } from 'express-serve-static-core'
import {
  ForgotPasswordReqBody,
  HealthProfileIntakeReqBody,
  LoginReqBody,
  MealRecommendationReqBody,
  LogoutReqBody,
  RecommendPTReqQuery,
  RefreshTokenReqBody,
  RegisterReqBody,
  ResetPasswordReqBody,
  SwapMealRecommendationReqBody,
  UpdateMeReqBody,
  UpdatePTProfileReqBody,
  TokenPayload
} from '~/models/requests/User.request'
import { AccountStatus } from '~/models/schemas/User.schema'
import usersService from '~/services/user.services'
import { USERS_MESSAGES } from '~/constants/messages'

export const registerController = async (
  req: Request<ParamsDictionary, Record<string, never>, RegisterReqBody>,
  res: Response
) => {
  const result = await usersService.register(req.body)
  return res.json({
    message: USERS_MESSAGES.REGISTER_SUCCESS,
    result
  })
}
export const loginController = async (
  req: Request<ParamsDictionary, Record<string, never>, LoginReqBody>,
  res: Response
) => {
  const result = await usersService.login(req.body)
  return res.json({
    message: USERS_MESSAGES.LOGIN_SUCCESS,
    result
  })
}

export const logoutController = async (
  req: Request<ParamsDictionary, Record<string, never>, LogoutReqBody>,
  res: Response
) => {
  const { refresh_token } = req.body
  const result = await usersService.logout(refresh_token)
  return res.status(HTTP_STATUS.OK).json(result)
}

export const refreshTokenController = async (
  req: Request<ParamsDictionary, Record<string, never>, RefreshTokenReqBody>,
  res: Response
) => {
  const decoded_refresh_token = (req as unknown as { decoded_refresh_token: TokenPayload }).decoded_refresh_token
  const { refresh_token } = req.body

  const result = await usersService.refreshToken({
    user_id: decoded_refresh_token.user_id,
    status: (decoded_refresh_token.status as AccountStatus) || AccountStatus.ACTIVE,
    refresh_token,
    exp: decoded_refresh_token.exp
  })

  return res.status(HTTP_STATUS.OK).json(result)
}

export const forgotPasswordController = async (
  req: Request<ParamsDictionary, Record<string, never>, ForgotPasswordReqBody>,
  res: Response
) => {
  const { email } = req.body
  const result = await usersService.forgotPasswordByEmail(email)
  return res.status(HTTP_STATUS.OK).json(result)
}

export const resetPasswordController = async (
  req: Request<ParamsDictionary, Record<string, never>, ResetPasswordReqBody>,
  res: Response
) => {
  const { user_id, password, forgot_password_token } = req.body

  const result = await usersService.resetPassword({
    user_id,
    password,
    forgot_password_token
  })

  return res.status(HTTP_STATUS.OK).json(result)
}

export const checkEmailExistController = async (req: Request, res: Response) => {
  const email = String(req.query.email || '').trim()
  const exists = await usersService.checkEmailExist(email)
  return res.status(HTTP_STATUS.OK).json({
    exists,
    message: exists ? USERS_MESSAGES.EMAIL_ALREADY_EXISTS : USERS_MESSAGES.EMAIL_AVAILABLE
  })
}

export const checkUsernameExistController = async (req: Request, res: Response) => {
  const username = String(req.query.username || '').trim()
  const exists = await usersService.checkUsernameExist(username)
  return res.status(HTTP_STATUS.OK).json({
    exists,
    message: exists ? USERS_MESSAGES.USERNAME_ALREADY_EXISTS : USERS_MESSAGES.USERNAME_AVAILABLE
  })
}

export const healthProfileIntakeController = async (
  req: Request<ParamsDictionary, Record<string, never>, HealthProfileIntakeReqBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.upsertHealthProfile(decoded_authorization.user_id, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.HEALTH_PROFILE_UPDATED_SUCCESS,
    result
  })
}

export const healthMetricsController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.getHealthMetrics(decoded_authorization.user_id)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.HEALTH_METRICS_RETRIEVED_SUCCESS,
    result
  })
}

export const getMeController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.getMe(decoded_authorization.user_id)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.PROFILE_RETRIEVED_SUCCESS,
    result
  })
}

export const getAllUsersController = async (req: Request, res: Response) => {
  const result = await usersService.getAllUsers()
  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách người dùng thành công',
    result
  })
}

export const updateMeController = async (
  req: Request<ParamsDictionary, Record<string, never>, UpdateMeReqBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.updateMe(decoded_authorization.user_id, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.PROFILE_UPDATED_SUCCESS,
    result
  })
}

export const updatePTProfileController = async (
  req: Request<ParamsDictionary, Record<string, never>, UpdatePTProfileReqBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.updatePTProfile(decoded_authorization.user_id, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.PT_PROFILE_UPDATED_SUCCESS,
    result
  })
}

export const updateUserStatusController = async (req: Request, res: Response) => {
  const { user_id } = req.params as { user_id: string }
  const { status } = req.body

  const result = await usersService.updateUserStatus(user_id, status)
  return res.status(HTTP_STATUS.OK).json(result)
}

export const registerPTServiceController = async (req: Request<{ service_id: string }>, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.registerPTService(decoded_authorization.user_id, req.params.service_id)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const getMyRegisteredPTServicesController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.getMyRegisteredPTServices(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.REGISTERED_PT_SERVICES_RETRIEVED_SUCCESS,
    result
  })
}

export const recommendMealsController = async (
  req: Request<ParamsDictionary, Record<string, never>, MealRecommendationReqBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const days = req.body.days || 1
  const result = await usersService.recommendMeals(decoded_authorization.user_id, days)
  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.MEAL_RECOMMENDATION_GENERATED_SUCCESS,
    result
  })
}

export const swapMealRecommendationController = async (
  req: Request<ParamsDictionary, Record<string, never>, SwapMealRecommendationReqBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await usersService.swapRecommendedFood(
    decoded_authorization.user_id,
    req.body.current_food_id,
    req.body.target_calories
  )

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.FOOD_SWAP_RECOMMENDATION_SUCCESS,
    result
  })
}

export const recommendPTController = async (
  req: Request<ParamsDictionary, Record<string, never>, Record<string, never>, RecommendPTReqQuery>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const limit = Number(req.query.limit || 3)
  const result = await usersService.recommendPTs(decoded_authorization.user_id, limit)

  return res.status(HTTP_STATUS.OK).json({
    message: USERS_MESSAGES.PT_RECOMMENDATION_GENERATED_SUCCESS,
    result
  })
}

export const approvePTController = async (req: Request, res: Response) => {
  const { user_id } = req.params as { user_id: string }
  const result = await usersService.approvePTAccount(user_id)
  
  return res.status(HTTP_STATUS.OK).json(result)
}
