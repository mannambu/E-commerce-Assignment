import { Router } from 'express'
import {
  checkInClientController,
  createPTServiceController,
  deletePTServiceController,
  getPTClientsController,
  getMyPTServiceListController,
  getPTServiceDetailController,
  getPTServiceListController,
  getPTUserByUsernameController,
  updatePTServiceController
} from '~/controllers/pt.controllers'
import { getPTServiceDetailValidator, updatePTServiceValidator } from '~/middlewares/pt.middlewares'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const ptRouter = Router()

/**
 * Description. Get PT service list with pagination
 * Path: /services
 * Method: GET
 * Query: { limit?: number, page?: number }
 */
ptRouter.get('/services', wrapRequestHandler(getPTServiceListController))

/**
 * Description. Get current PT's own service list (includes active and inactive)
 * Path: /my-services
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 * Query: { limit?: number, page?: number, search?: string }
 */
ptRouter.get('/my-services', accessTokenValidator, wrapRequestHandler(getMyPTServiceListController))

/**
 * Description. Get PT service detail by service id
 * Path: /services/:service_id
 * Method: GET
 * Params: { service_id: string }
 */
ptRouter.get('/services/:service_id', wrapRequestHandler(getPTServiceDetailController))

/**
 * Description. Create a new PT service package
 * Path: /services
 * Method: POST
 * Header: { Authorization: Bearer <access_token> }
 * Body: { title: string, description: string, price: number, sessions: number, durationDays: number, isActive?: boolean, ptId?: string }
 * Notes:
 * - Role PT: ptId is ignored and automatically resolved from current account.
 * - Role Admin: can create for a target PT by providing ptId.
 */
ptRouter.post('/services', accessTokenValidator, wrapRequestHandler(createPTServiceController))

/**
 * Description. Debug route to get PT user by username
 * Path: /debug/user-by-username
 * Method: GET
 * Query: { username: string }
 */
ptRouter.get('/debug/user-by-username', wrapRequestHandler(getPTUserByUsernameController))

/**
 * Description. Update a PT service package
 * Path: /services/:service_id
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 */
ptRouter.patch(
  '/services/:service_id',
  accessTokenValidator, // Bắt buộc đăng nhập
  getPTServiceDetailValidator, // Check param ID
  updatePTServiceValidator, // Check dữ liệu gửi lên
  wrapRequestHandler(updatePTServiceController)
)

/**
 * Description. Delete (Soft delete) a PT service package
 * Path: /services/:service_id
 * Method: DELETE
 * Header: { Authorization: Bearer <access_token> }
 */
ptRouter.delete(
  '/services/:service_id',
  accessTokenValidator,
  getPTServiceDetailValidator,
  wrapRequestHandler(deletePTServiceController)
)

// Trong file backend/src/routes/pt.routes.ts

/**
 * Description. Get list of clients who registered current PT's services (PT Dashboard)
 * Path: /clients
 * Method: GET
 * Header: { Authorization: Bearer <access_token> }
 */
ptRouter.get(
  '/clients',
  accessTokenValidator, // Bắt buộc phải đăng nhập
  wrapRequestHandler(getPTClientsController)
)

/**
 * Description. Check-in (deduct 1 session) for a client
 * Path: /clients/:client_id/services/:service_id/check-in
 * Method: PATCH
 * Header: { Authorization: Bearer <access_token> }
 */
ptRouter.patch(
  '/clients/:client_id/services/:service_id/check-in',
  accessTokenValidator,
  wrapRequestHandler(checkInClientController)
)

export default ptRouter
