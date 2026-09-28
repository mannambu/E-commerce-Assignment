import { ObjectId } from 'mongodb'

export interface SessionInput {
  _id?: ObjectId
  token: string
  created_at?: Date
  user_id: ObjectId
  iat: number
  exp: number
  sessionId?: ObjectId
  tokenVersion?: number
  revoked_at?: Date
  last_used_at?: Date
}
// Tên collection phản ánh phiên đăng nhập; tên field giữ tương thích luồng token hiện tại.
export default class Session {
  _id?: ObjectId
  token: string
  created_at: Date
  user_id: ObjectId
  iat: Date
  exp: Date
  sessionId: ObjectId
  tokenVersion: number
  revoked_at?: Date
  last_used_at?: Date
  constructor({
    _id,
    token,
    created_at,
    user_id,
    iat,
    exp,
    sessionId,
    tokenVersion,
    revoked_at,
    last_used_at
  }: SessionInput) {
    this._id = _id
    this.token = token
    this.created_at = created_at || new Date()
    this.user_id = user_id
    this.iat = new Date(iat * 1000) // Convert Epoch time to Date
    this.exp = new Date(exp * 1000) // Convert Epoch time to Date
    this.sessionId = sessionId ?? new ObjectId()
    this.tokenVersion = tokenVersion ?? 0
    this.revoked_at = revoked_at
    this.last_used_at = last_used_at
  }
}
