import { Request, Response } from 'express'
import shipper from '~/services/shipper.services'

export async function shipperStatusController(req: Request, res: Response) {
  const result = await shipper.updateStatus(
    req.decoded_authorization!.user_id,
    String(req.params.orderId),
    String(req.params.deliveryId),
    req.body
  )
  res.json({ result })
}
