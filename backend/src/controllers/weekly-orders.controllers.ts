import { Request, Response } from 'express'
import weeklyOrders from '~/services/weekly-orders.services'

type DeliveryParams = { orderId: string; deliveryId: string; itemId: string }

export const getDeliveryAlternativesController = async (req: Request<DeliveryParams>, res: Response) => {
  const result = await weeklyOrders.getAlternatives(
    req.decoded_authorization!.user_id,
    req.params.orderId,
    req.params.deliveryId,
    req.params.itemId
  )
  res.json({ message: 'Các món có thể đổi', result })
}

export const swapDeliveryItemController = async (req: Request<DeliveryParams>, res: Response) => {
  const result = await weeklyOrders.swapItem(
    req.decoded_authorization!.user_id,
    req.params.orderId,
    req.params.deliveryId,
    req.params.itemId,
    req.body
  )
  res.json({ message: 'Đã đổi món trong ngày giao', result })
}

export const previewDeliveryCancellationController = async (req: Request<DeliveryParams>, res: Response) => {
  const result = await weeklyOrders.previewCancellation(
    req.decoded_authorization!.user_id,
    req.params.orderId,
    req.params.deliveryId
  )
  res.json({ message: 'Chi phí và chính sách khi hủy ngày giao', result })
}

export const cancelDeliveryController = async (req: Request<DeliveryParams>, res: Response) => {
  const result = await weeklyOrders.cancelDelivery(
    req.decoded_authorization!.user_id,
    req.params.orderId,
    req.params.deliveryId,
    req.body
  )
  res.json({ message: 'Đã hủy ngày giao; yêu cầu hoàn tiền (nếu có) đang chờ xử lý', result })
}

export const updateDeliveryStatusController = async (req: Request<DeliveryParams>, res: Response) => {
  const result = await weeklyOrders.updateDeliveryStatus(
    req.decoded_authorization!.user_id,
    req.params.orderId,
    req.params.deliveryId,
    req.body
  )
  res.json({ message: 'Đã cập nhật trạng thái ngày giao', result })
}
