import { Request, Response } from 'express'
import managerOperations from '~/services/manager-operations.services'

export async function resolveFailureController(req: Request, res: Response) {
  res.json({
    result: await managerOperations.resolveFailure(
      req.decoded_authorization!.user_id,
      String(req.params.orderId),
      String(req.params.deliveryId),
      req.body
    )
  })
}
export async function reconcileCODController(req: Request, res: Response) {
  res.json({
    result: await managerOperations.reconcileCOD(
      req.decoded_authorization!.user_id,
      String(req.params.orderId),
      String(req.params.deliveryId),
      req.body
    )
  })
}
export async function getCODLedgerController(req: Request, res: Response) {
  res.set('Cache-Control', 'private, no-store').json({
    result: await managerOperations.getCODLedger(
      req.decoded_authorization!.user_id,
      String(req.params.orderId),
      String(req.params.deliveryId)
    )
  })
}
