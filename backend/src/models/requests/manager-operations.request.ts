export interface FailureResolutionReqBody {
  action: 'Retry' | 'Cancel'
  version: number
  reason: string
}

export interface CODReconciliationReqBody {
  action: 'Collect' | 'Refund'
  version: number
  amount: number
  reference: string
  reason: string
}
