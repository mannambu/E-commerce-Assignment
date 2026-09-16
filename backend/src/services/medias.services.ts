import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import { config } from 'dotenv'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Errors'

config()

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

class MediasService {
  async uploadImage(filepath: string) {
    try {
      // 1. Đẩy file lên Cloudinary
      const result = await cloudinary.uploader.upload(filepath, {
        folder: 'pt-ecommerce' // Đổi tên thư mục này theo ý bạn
      })

      // 2. Upload xong thì xóa file tạm ở dưới máy tính/server đi
      fs.unlinkSync(filepath)

      // 3. Trả về cái link ảnh an toàn (https)
      return result.secure_url
    } catch (error) {
      // Nhớ dọn dẹp file tạm nếu lỡ quá trình upload bị lỗi mạng
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath)
      }
      throw new ErrorWithStatus({
        message: 'Lỗi khi upload ảnh lên Cloudinary',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    }
  }
}

const mediasService = new MediasService()
export default mediasService