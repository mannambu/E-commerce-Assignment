import { Router } from 'express'
import {
  accessTokenValidator,
  createUserValidator,
  getUsersValidator,
  checkEmailExistQueryValidator,
  checkUsernameExistQueryValidator,
  forgotPasswordValidator,
  healthProfileIntakeValidator,
  loginValidator,
  mealRecommendationValidator,
  refreshTokenValidator,
  registerValidator,
  resetPasswordValidator,
  swapMealRecommendationValidator,
  updateMeValidator,
  isAdminValidator,
  isCustomerValidator,
  updateUserStatusValidator,
  updateUserRoleValidator
} from '~/middlewares/users.middlewares'
import {
  logoutAllController,
  createUserController,
  checkEmailExistController,
  checkUsernameExistController,
  forgotPasswordController,
  getMeController,
  healthMetricsController,
  healthProfileIntakeController,
  loginController,
  logoutController,
  recommendMealsController,
  refreshTokenController,
  registerController,
  resetPasswordController,
  swapMealRecommendationController,
  updateMeController,
  updateUserStatusController,
  updateUserRoleController,
  getAllUsersController
} from '~/controllers/users.controllers'
import { wrapRequestHandler } from '~/utils/handlers'

const usersRouter = Router()

/**
 * Description. Register a new user
 * Path: /register
 * Method: POST
 * Body: {email: string, username: string, password: string, confirm_password: string, phone: string, role?: 'Customer', healthProfile?: HealthProfile
 * }
 */
usersRouter.post('/register', registerValidator, wrapRequestHandler(registerController))

/**
 * Description. Login a user
 * Path: /login
 * Method: POST
 * Body: {  identifier: string; email?: string; password: string; remember_me?: boolean }
 */
usersRouter.post('/login', loginValidator, wrapRequestHandler(loginController))

/**
 * Description. Logout a user
 * Path: /logout
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { refresh_token: string }
 */
usersRouter.post('/logout', refreshTokenValidator, wrapRequestHandler(logoutController))
usersRouter.post('/logout-all', accessTokenValidator, wrapRequestHandler(logoutAllController))
usersRouter.post(
  '/',
  accessTokenValidator,
  isAdminValidator,
  createUserValidator,
  wrapRequestHandler(createUserController)
)

/**
 * Description. Check if email is already used
 * Path: /check-email
 * Method: GET
 * Query: { email: string }
 */
usersRouter.get('/check-email', checkEmailExistQueryValidator, wrapRequestHandler(checkEmailExistController))

/**
 * Description. Check if username is already used
 * Path: /check-username
 * Method: GET
 * Query: { username: string }
 */
usersRouter.get('/check-username', checkUsernameExistQueryValidator, wrapRequestHandler(checkUsernameExistController))

/**
 * Description. Refresh token
 * Path: /refresh-token
 * Method: POST
 * Body: { refresh_token: string }
 */
usersRouter.post('/refresh-token', refreshTokenValidator, wrapRequestHandler(refreshTokenController))

/**
 * Description. Forgot password by email
 * Path: /forgot-password
 * Method: POST
 * Body: { email: string }
 */
usersRouter.post('/forgot-password', forgotPasswordValidator, wrapRequestHandler(forgotPasswordController))

/**
 * Description. Reset password
 * Path: /reset-password
 * Method: POST
 * Body: { email: string, reset_code: string, password: string, confirm_password: string }
 */
usersRouter.post('/reset-password', resetPasswordValidator, wrapRequestHandler(resetPasswordController))

/**
 * Description. Get current user profile
 * Path: /me
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
usersRouter.get('/me', accessTokenValidator, wrapRequestHandler(getMeController))

/**
 * Description. Update current user profile
 * Path: /me
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Body: { username?: string, phone?: string, date_of_birth?: string }
 */
usersRouter.patch('/me', accessTokenValidator, updateMeValidator, wrapRequestHandler(updateMeController))

/**
 * Description. Search and paginate Customer/Manager accounts (Admin only)
 * Path: /
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
usersRouter.get(
  '/',
  accessTokenValidator,
  isAdminValidator, // Chỉ Admin mới được xem
  getUsersValidator,
  wrapRequestHandler(getAllUsersController)
)

/**
 * Description. Lock / unlock a Customer or Manager account
 * Path: /:user_id/status
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 * Body: { status: 'Active' | 'Locked', reason: string }
 */
usersRouter.patch(
  '/:user_id/status',
  accessTokenValidator,
  isAdminValidator, // Chỉ Admin mới được khóa tài khoản
  updateUserStatusValidator,
  wrapRequestHandler(updateUserStatusController)
)

// Admin chỉ chuyển vai trò giữa Customer và Manager; mọi phiên cũ bị thu hồi.
usersRouter.patch(
  '/:user_id/role',
  accessTokenValidator,
  isAdminValidator,
  updateUserRoleValidator,
  wrapRequestHandler(updateUserRoleController)
)

/**
 * Description. Intake or update health profile and auto-calculate metrics
 * Path: /health-profile
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { gender: 'Male' | 'Female', age: number, heightCm: number, weightKg: number, activityLevel: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active', goal: 'LoseFat' | 'GainMuscle' | 'MaintainWeight', allergies?: string[] }
 */
usersRouter.post(
  '/health-profile',
  accessTokenValidator,
  isCustomerValidator,
  healthProfileIntakeValidator,
  wrapRequestHandler(healthProfileIntakeController)
)

/**
 * Description. Get current health metrics dashboard data
 * Path: /health-metrics
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
usersRouter.get(
  '/health-metrics',
  accessTokenValidator,
  isCustomerValidator,
  wrapRequestHandler(healthMetricsController)
)

/**
 * Description. Recommend meal plan by target calories and restrictions
 * Path: /recommendations/meals
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { days?: 1 | 7 }
 */
usersRouter.post(
  '/recommendations/meals',
  accessTokenValidator,
  isCustomerValidator,
  mealRecommendationValidator,
  wrapRequestHandler(recommendMealsController)
)

/**
 * Description. Swap one recommended food with a close-calorie alternative
 * Path: /recommendations/meals/swap
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { current_food_id: string, target_calories?: number }
 */
usersRouter.post(
  '/recommendations/meals/swap',
  accessTokenValidator,
  isCustomerValidator,
  swapMealRecommendationValidator,
  wrapRequestHandler(swapMealRecommendationController)
)

export default usersRouter
