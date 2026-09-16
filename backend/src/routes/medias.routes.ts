import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import { uploadImageController } from '~/controllers/medias.controllers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const mediasRouter = Router()

// 1. Tự động tạo thư mục tạm (tránh lỗi vặt)
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

// 2. Cấu hình Multer cơ bản và trâu bò nhất để test
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn 5MB
})

/**
 * Description: Upload a single image
 * Path: /medias/upload-image
 * Method: POST
 */
mediasRouter.post(
  '/upload-image',
  accessTokenValidator,            // Bước 1: Check Token
  upload.single('image'),          // Bước 2: BẮT BUỘC PHẢI CÓ DÒNG NÀY ĐỂ ĐỌC FILE
  wrapRequestHandler(uploadImageController) // Bước 3: Đẩy vào Controller
)

export default mediasRouter