import { ObjectId } from 'mongodb'
import { CancellationPolicySnapshot } from './Order.schema'

/** Chỉ một document. Các thời hạn cố định nằm trong common.ts. */
export default interface Settings {
  _id: 'commerce'
  kitchenCutoffTime: string // HH:mm, theo Asia/Ho_Chi_Minh.
  kitchenCutoffDaysBefore: number // 0 = ngày giao; 1 = ngày trước đó.
  cancellationPolicy: CancellationPolicySnapshot
  updatedBy: ObjectId
  updatedAt: Date
}
