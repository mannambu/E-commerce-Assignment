import { config } from 'dotenv'
import express from 'express'
import usersRouter from '~/routes/users.routes'
import cartRouter from '~/routes/cart.routes'
import ordersRouter from '~/routes/orders.routes'
import databaseService from '~/services/database.services'
import cors from 'cors'
import { defaultErrorHandler } from '~/middlewares/errors.middlewares'
import foodsRouter from './routes/foods.routes'
import trackingRouter from '~/routes/tracking.routes'
import reviewsRouter from '~/routes/reviews.routes'
import mediasRouter from './routes/medias.routes'
import adminRouter from './routes/admin.routes'

config()
// Index được chuẩn bị riêng bằng npm run schema:indexes; startup không sửa DB cũ.
const app = express()
const allowedOrigins = [
  'http://localhost:3000',
  'https://e-commerce-mauve-xi.vercel.app',
  'https://e-commerce-git-haobranch-phongwd2311s-projects.vercel.app'
]

app.use(
  cors({
    origin: function (origin, callback) {
      // Cho phép các yêu cầu không có origin (như Postman) hoặc nằm trong danh sách allowedOrigins
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error('CORS chặn: Link này không có quyền truy cập!'))
      }
    },
    credentials: true
  })
)

const port = process.env.PORT || 4000

// Tạo folder upload
app.use(express.json())
app.use('/users', usersRouter)
app.use('/cart', cartRouter)
app.use('/orders', ordersRouter)
app.use('/foods', foodsRouter)
app.use('/tracking', trackingRouter)
app.use('/reviews', reviewsRouter)

// 1. Phải cấp quyền public thư mục 'uploads' thì Frontend mới xem được ảnh
app.use('/uploads', express.static('uploads'))

// 2. Đăng ký route medias
app.use('/medias', mediasRouter)

app.use('/admin', adminRouter)

app.use(defaultErrorHandler)
databaseService
  .connect()
  .then(() => {
    app.listen(port, () => console.log(`Server listening on http://localhost:${port}`))
  })
  .catch(() => {
    console.error('Cannot connect to database; check configuration')
    process.exitCode = 1
  })
