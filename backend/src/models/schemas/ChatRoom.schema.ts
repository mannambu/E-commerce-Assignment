import { ObjectId } from 'mongodb'

export interface Message {
  senderId: ObjectId
  message: string
  mediaUrl?: string
  createdAt: Date
}

export interface Exercise {
  date: Date
  description: string
  videoUrl?: string
  completed: boolean
}

export interface ChatRoomType {
  _id?: ObjectId

  customerId: ObjectId
  ptId: ObjectId

  messages: Message[]

  exercises: Exercise[]

  createdAt?: Date
  updatedAt?: Date
}

export default class ChatRoom implements ChatRoomType {
  _id?: ObjectId

  customerId: ObjectId
  ptId: ObjectId

  messages: Message[]

  exercises: Exercise[]

  createdAt?: Date
  updatedAt?: Date

  constructor(chatRoom: ChatRoomType) {
    this._id = chatRoom._id
    this.customerId = chatRoom.customerId
    this.ptId = chatRoom.ptId
    this.messages = chatRoom.messages
    this.exercises = chatRoom.exercises
    const now = new Date()
    this.createdAt = chatRoom.createdAt || now
    this.updatedAt = chatRoom.updatedAt || now
  }
}
