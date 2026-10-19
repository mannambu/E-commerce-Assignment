import { Request, Response } from 'express'
import operations from '~/services/order-operations.services'

export async function assignKitchenController(req: Request, res: Response) {
  const result = await operations.assignKitchen(
    req.decoded_authorization!.user_id,
    String(req.params.orderId),
    String(req.params.deliveryId),
    req.body
  )
  res.json({ result })
}
export async function assignShipperController(req: Request, res: Response) {
  const result = await operations.assignShipper(
    req.decoded_authorization!.user_id,
    String(req.params.orderId),
    String(req.params.deliveryId),
    req.body
  )
  res.json({ result })
}
export async function kitchenStatusController(req: Request, res: Response) {
  const result = await operations.kitchenStatus(
    req.decoded_authorization!.user_id,
    String(req.params.orderId),
    String(req.params.deliveryId),
    req.body
  )
  res.json({ result })
}
