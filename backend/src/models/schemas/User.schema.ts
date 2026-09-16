import { ObjectId } from 'mongodb'

export enum UserRole {
  CUSTOMER = 'Customer',
  PT = 'PT',
  ADMIN = 'Admin'
}

export enum AccountStatus {
  ACTIVE = 'Active',
  PENDING = 'Pending',
  LOCKED = 'Locked'
}

export type Gender = 'Male' | 'Female'
export type ActivityLevel = 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active'
export type HealthGoal = 'LoseFat' | 'GainMuscle' | 'MaintainWeight'

export interface MacroDistribution {
  protein: number
  carb: number
  fat: number
}

export interface HealthProfile {
  gender: Gender
  age: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: HealthGoal
  allergies: string[]
  bmr?: number
  tdee?: number
  targetCalories?: number
  macroDistribution?: MacroDistribution
}

export interface PTProfile {
  experienceYears: number
  specialties: string[]
  rating: number
  portfolioImages: string[]
  approvedByAdmin?: boolean
}

export interface Notification {
  _id: ObjectId
  type: 'Order' | 'Chat' | 'System'
  message: string
  read: boolean
  createdAt: Date
}

export interface WeightTracking {
  date: Date
  weightKg: number
}

export interface CalorieTracking {
  date: Date
  caloriesConsumed: number
}

export interface RegisteredPTService {
  serviceId: ObjectId
}

export interface UserType {
  _id?: ObjectId
  email: string
  username: string
  avatar?: string
  password: string
  phone: string
  role: UserRole
  account_status: AccountStatus
  loginAttempts: number
  locked_until?: Date
  created_at?: Date
  updated_at?: Date
  forgot_password_token: string // jwt hoặc '' nếu đã xác thực email
  healthProfile?: HealthProfile
  ptProfile?: PTProfile
  notifications: Notification[]
  weightTracking: WeightTracking[]
  calorieTracking: CalorieTracking[]
  registeredPTServices: ObjectId[]
}

export default class User implements UserType {
  _id?: ObjectId
  email: string
  username: string
  avatar?: string
  password: string
  phone: string
  role: UserRole
  account_status: AccountStatus
  loginAttempts: number
  locked_until?: Date
  created_at?: Date
  updated_at?: Date
  forgot_password_token: string // jwt hoặc '' nếu đã xác thực email
  healthProfile?: HealthProfile
  ptProfile?: PTProfile
  notifications: Notification[]
  weightTracking: WeightTracking[]
  calorieTracking: CalorieTracking[]
  registeredPTServices: ObjectId[]

  constructor(user: UserType) {
    this._id = user._id
    this.email = user.email
    this.username = user.username
    this.avatar = user.avatar
    this.password = user.password
    this.phone = user.phone
    this.role = user.role
    this.account_status = user.account_status || AccountStatus.PENDING
    this.loginAttempts = user.loginAttempts || 0
    this.locked_until = user.locked_until
    this.forgot_password_token = user.forgot_password_token
    this.healthProfile = user.healthProfile
    this.ptProfile = user.ptProfile
    this.notifications = user.notifications || []
    this.weightTracking = user.weightTracking || []
    this.calorieTracking = user.calorieTracking || []
    this.registeredPTServices = user.registeredPTServices || []
    const now = new Date()
    this.created_at = user.created_at || now
    this.updated_at = user.updated_at || now
  }
}
