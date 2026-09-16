import { ObjectId } from 'mongodb'

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
  details?: string
  images: string[]
  price: number
  calories: number
  nutrition: Nutrition
  ingredients: Ingredient[]
  tags: string[] // ["Vegan", "GlutenFree"]
  stock: number
  isActive: boolean
  isCombo?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export default class Food implements FoodType {
  _id?: ObjectId
  name: string
  description: string
  details: string
  images: string[]
  price: number
  calories: number
  nutrition: Nutrition
  ingredients: Ingredient[]
  tags: string[]
  stock: number
  isActive: boolean
  isCombo: boolean
  createdAt?: Date
  updatedAt?: Date

  constructor(food: FoodType) {
    this._id = food._id
    this.name = food.name
    this.description = food.description
    this.details = food.details || ''
    this.images = food.images
    this.price = food.price
    this.calories = food.calories
    this.nutrition = food.nutrition
    this.ingredients = food.ingredients
    this.tags = food.tags
    this.stock = food.stock
    this.isActive = food.isActive
    this.isCombo = food.isCombo ?? false
    const now = new Date()
    this.createdAt = food.createdAt || now
    this.updatedAt = food.updatedAt || now
  }
}
