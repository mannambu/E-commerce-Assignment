import multer from 'multer'
import path from 'path'
import fs from 'fs'

// Đảm bảo thư mục uploads luôn tồn tại để không bị lỗi vặt
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads')
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/') // Nơi lưu file tạm
  },
  filename: (req, file, cb) => {
    // Đổi tên file để không bị trùng (Thêm timestamp)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

// Bộ lọc chỉ cho phép ảnh (tùy chọn nhưng rất nên có)
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Chỉ cho phép upload file ảnh!'), false)
  }
}

export const uploadImageMiddleware = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn 5MB
})