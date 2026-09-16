import { Request, Response, NextFunction } from 'express'
import { omit } from 'lodash'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Errors'

export const defaultErrorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  void _next
  const parseError = err as SyntaxError & { status?: number; body?: unknown }

  // express.json() sẽ ném SyntaxError với status=400 khi body JSON sai định dạng
  if (err instanceof SyntaxError && parseError.status === HTTP_STATUS.BAD_REQUEST && 'body' in parseError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Body JSON không hợp lệ. Vui lòng kiểm tra lại cú pháp JSON gửi lên.'
    })
  }

  if (err instanceof ErrorWithStatus) {
    return res.status(err.status).json(omit(err, ['status']))
  }
  const internalError = err as Error
  Object.getOwnPropertyNames(internalError).forEach((key) => {
    Object.defineProperty(internalError, key, { enumerable: true })
  })
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    message: internalError.message,
    errorInfo: omit(internalError, ['stack'])
  })
}
