import { Request, Response } from 'express'
import mediasService from '~/services/medias.services'
import HTTP_STATUS from '~/constants/httpStatus'

export const uploadImageController = async (req: Request, res: Response) => {
  // THÊM 2 DÒNG NÀY ĐỂ SOI XEM REQUEST CÓ GÌ
  // console.log("File nhận được:", req.file);
  // console.log("Body nhận được:", req.body);
  
    // Multer sẽ đính kèm file vào req.file
  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Không tìm thấy file ảnh. Vui lòng gửi qua form-data với key là "image"'
    })
  }

  // Lấy đường dẫn file tạm và ném vào service
  const imageUrl = await mediasService.uploadImage(req.file.path)

  return res.status(HTTP_STATUS.OK).json({
    message: 'Upload ảnh thành công',
    result: [imageUrl] // Trả về mảng như trong API Spec của bạn
  })
}