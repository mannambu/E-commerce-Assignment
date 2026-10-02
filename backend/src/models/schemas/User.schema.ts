import { ObjectId } from 'mongodb'

export enum UserRole {
  CUSTOMER = 'Customer',
  MANAGER = 'Manager',
  ADMIN = 'Admin'
}

export enum AccountStatus {
  ACTIVE = 'Active',
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
  dietaryRestrictions?: string[]
  targetWeightKg?: number
  bmr?: number
  tdee?: number
  targetCalories?: number
  macroDistribution?: MacroDistribution
  version?: number
  calculatedAt?: Date
}

export interface UserType {
  _id?: ObjectId
  email: string
  username?: string
  avatar?: string
  date_of_birth?: Date
  password: string
  phone?: string
  role?: UserRole
  account_status?: AccountStatus
  loginAttempts?: number
  locked_until?: Date
  created_at?: Date
  updated_at?: Date
  forgot_password_token?: string // SHA-256 of the random reset token; cleared after use.
  forgot_password_expires_at?: Date | null
  password_changed_at?: Date
  tokenVersion?: number // Increment to revoke every session after reset/lock/role changes.
  notificationPreferences?: { newsEnabled: boolean }
  healthProfile?: HealthProfile
}

export default class User implements UserType {
  _id?: ObjectId
  email: string
  username: string
  avatar?: string
  date_of_birth?: Date
  password: string
  phone: string
  role: UserRole
  account_status: AccountStatus
  loginAttempts: number
  locked_until?: Date
  created_at?: Date
  updated_at?: Date
  forgot_password_token: string
  forgot_password_expires_at?: Date | null
  password_changed_at?: Date
  tokenVersion: number
  notificationPreferences: { newsEnabled: boolean }
  healthProfile?: HealthProfile

  constructor(user: UserType) {
    this._id = user._id
    this.email = user.email
    this.username = user.username ?? ''
    this.avatar = user.avatar
    this.date_of_birth = user.date_of_birth
    this.password = user.password
    this.phone = user.phone ?? ''
    this.role = user.role ?? UserRole.CUSTOMER
    this.account_status = user.account_status ?? AccountStatus.ACTIVE
    this.loginAttempts = user.loginAttempts ?? 0
    this.locked_until = user.locked_until
    this.forgot_password_token = user.forgot_password_token ?? ''
    this.forgot_password_expires_at = user.forgot_password_expires_at
    this.password_changed_at = user.password_changed_at
    this.tokenVersion = user.tokenVersion ?? 0
    this.notificationPreferences = user.notificationPreferences ?? { newsEnabled: true }
    this.healthProfile = user.healthProfile
    const now = new Date()
    this.created_at = user.created_at || now
    this.updated_at = user.updated_at || now
  }
}
