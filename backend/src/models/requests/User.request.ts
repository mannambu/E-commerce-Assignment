import { JwtPayload } from 'jsonwebtoken'
import { TokenType } from '~/constants/enums'
import { HealthProfile, UserRole } from '~/models/schemas/User.schema'

export interface TokenPayload extends JwtPayload {
  user_id: string
  token_type: TokenType
  exp: number
  iat: number
  status?: string
  role?: UserRole
  sessionId?: string
  tokenVersion?: number
}

export interface RegisterReqBody {
  email: string
  username: string
  password: string
  confirm_password: string
  phone: string
  role?: UserRole.CUSTOMER
  healthProfile?: HealthProfile
}

export interface LoginReqBody {
  identifier: string
  email?: string
  password: string
  remember_me?: boolean
}

export interface LogoutReqBody {
  refresh_token: string
}

export interface RefreshTokenReqBody {
  refresh_token: string
}

export interface ForgotPasswordReqBody {
  email: string
}

export interface ResetPasswordReqBody {
  user_id: string
  forgot_password_token: string
  password: string
  confirm_password: string
}

export interface UpdateMeReqBody {
  username?: string
  phone?: string
  date_of_birth?: string
  avatar?: string | null
  healthProfile?: HealthProfile
}

export interface HealthProfileIntakeReqBody {
  gender: 'Male' | 'Female'
  age: number
  heightCm: number
  weightKg: number
  activityLevel: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active'
  goal: 'LoseFat' | 'GainMuscle' | 'MaintainWeight'
  allergies?: string[]
}

export interface MealRecommendationReqBody {
  days: 1 | 7
}

export interface SwapMealRecommendationReqBody {
  current_food_id: string
  target_calories?: number
}
