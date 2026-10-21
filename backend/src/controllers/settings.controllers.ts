import { Request, Response } from 'express'
import settings from '~/services/settings.services'

export const getCommerceSettingsController = async (_req: Request, res: Response) => {
  res.json({ message: 'Cấu hình giao hàng', result: await settings.getCommerceRules() })
}

export const updateCommerceSettingsController = async (req: Request, res: Response) => {
  const result = await settings.updateCommerceRules(req.decoded_authorization!.user_id, {
    kitchenCutoffTime: req.body.kitchenCutoffTime,
    kitchenCutoffDaysBefore: req.body.kitchenCutoffDaysBefore
  })
  res.json({ message: 'Đã cập nhật giờ chốt bếp cho các đơn mới', result })
}
