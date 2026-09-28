import { ObjectId } from 'mongodb'
import { HealthGoal } from './User.schema'
import { normalizeSearchText } from './common'

export interface Ingredient {
  name: string
  allergyTags: string[] // ví dụ: ["Shellfish"]
}

export interface Nutrition {
  protein: number
  carb: number
  fat: number
}

export interface FoodType {
  _id?: ObjectId
  name: string
  description: string
  normalizedName?: string
  goalTags?: HealthGoal[]
  reservedStock?: number
  rating?: number
  reviewCount?: number
  version?: number
  images: string[]
  price: number
  calories: number
  nutrition: Nutrition
  ingredients: Ingredient[]
  tags: string[] // ["Vegan", "GlutenFree"]
  stock: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export default class Food implements FoodType {
  _id?: ObjectId
  name: string
  normalizedName: string
  goalTags: HealthGoal[]
  /** stock = unsold quantity, including holds; available = stock - reservedStock. */
  reservedStock: number
  rating: number
  reviewCount: number
  version: number
  description: string
  images: string[]
  price: number
  calories: number
  nutrition: Nutrition
  ingredients: Ingredient[]
  tags: string[]
  stock: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date

  constructor(food: FoodType) {
    this._id = food._id
    this.name = food.name
    this.normalizedName = food.normalizedName ?? normalizeSearchText(food.name)
    this.goalTags = food.goalTags ?? []
    this.reservedStock = food.reservedStock ?? 0
    this.rating = food.rating ?? 0
    this.reviewCount = food.reviewCount ?? 0
    this.version = food.version ?? 0
    this.description = food.description
    this.images = food.images
    this.price = food.price
    this.calories = food.calories
    this.nutrition = food.nutrition
    this.ingredients = food.ingredients
    this.tags = food.tags
    this.stock = food.stock
    this.isActive = food.isActive
    const now = new Date()
    this.createdAt = food.createdAt || now
    this.updatedAt = food.updatedAt || now
  }
}
