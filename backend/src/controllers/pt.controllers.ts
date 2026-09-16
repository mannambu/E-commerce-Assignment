import { Request, Response } from 'express'
import ptService from '~/services/pt.services'
import HTTP_STATUS from '~/constants/httpStatus'
import { TokenPayload } from '~/models/requests/User.request'

type PTServiceParams = {
  service_id: string
}

type PTServiceListQuery = {
  limit?: string
  page?: string
}

type CreatePTServiceBody = {
  ptId?: string
  title: string
  description: string
  price: number
  sessions: number
  durationDays: number
  isActive?: boolean
}

export const getPTServiceListController = async (
  req: Request<Record<string, never>, Record<string, never>, Record<string, never>, PTServiceListQuery>,
  res: Response
) => {
  const limit = Math.max(1, Number(req.query.limit) || 10)
  const page = Math.max(1, Number(req.query.page) || 1)

  const result = await ptService.getPTServiceList(limit, page)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách gói PT thành công',
    result
  })
}

export const getPTServiceDetailController = async (req: Request<PTServiceParams>, res: Response) => {
  const { service_id } = req.params
  const result = await ptService.getPTServiceById(service_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy chi tiết gói PT thành công',
    result
  })
}

export const createPTServiceController = async (
  req: Request<Record<string, never>, Record<string, never>, CreatePTServiceBody>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const result = await ptService.createPTService(decoded_authorization.user_id, req.body)

  return res.status(HTTP_STATUS.CREATED).json({
    message: 'Tạo gói PT thành công',
    result
  })
}

export const getPTUserByUsernameController = async (req: Request, res: Response) => {
  const username = String(req.query.username || '').trim()
  const result = await ptService.getPTUserByUsername(username)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy PT user thành công',
    result
  })
}

export const updatePTServiceController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const { service_id } = req.params as PTServiceParams

  const result = await ptService.updatePTService(decoded_authorization.user_id, service_id, req.body)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Cập nhật gói PT thành công',
    result
  })
}

export const deletePTServiceController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const { service_id } = req.params as PTServiceParams

  const result = await ptService.deletePTService(decoded_authorization.user_id, service_id)

  return res.status(HTTP_STATUS.OK).json(result)
}

export const getPTClientsController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  
  const result = await ptService.getPTClients(decoded_authorization.user_id)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách học viên thành công',
    result
  })
}

export const checkInClientController = async (req: Request, res: Response) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: any }).decoded_authorization
  
  const { client_id, service_id } = req.params as { client_id: string, service_id: string }

  const result = await ptService.checkInClientSession(decoded_authorization.user_id, client_id, service_id)
  return res.status(HTTP_STATUS.OK).json(result)
}

export const getMyPTServiceListController = async (
  req: Request<Record<string, never>, Record<string, never>, Record<string, never>, PTServiceListQuery & { search?: string }>,
  res: Response
) => {
  const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
  const limit = Math.max(1, Number(req.query.limit) || 10)
  const page = Math.max(1, Number(req.query.page) || 1)
  const search = String(req.query.search || '').trim()

  const result = await ptService.getMyPTServiceList(decoded_authorization.user_id, limit, page, search)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Lấy danh sách gói PT của bạn thành công',
    result
  })
}