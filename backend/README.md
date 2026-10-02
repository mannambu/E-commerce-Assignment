# Backend - E-commerce Assignment

Backend sử dụng Node.js + Express + TypeScript + MongoDB.

Database gồm 12 collection; giải thích từng collection, cấu trúc đơn/ngày giao và nhật ký sức khỏe nằm trong [database_schema.md](../docs/database_schema.md). Xem trước index bằng `npm run schema:indexes`; kiểm tra backend bằng `npm test`.

## Yêu cầu môi trường

- Node.js 20.19 trở lên
- npm 9+
- MongoDB replica set hoặc Atlas (luồng cập nhật hồ sơ/nhật ký dùng transaction)

## Cài đặt

```bash
npm install
```

## Biến môi trường

Tạo file `.env` trong thư mục `backend`.

```env
PORT=4000

DB_URI="mongodb+srv://<USER>:<PASSWORD>@<HOST_CLUSTER>/?retryWrites=true&w=majority"
DB_NAME=fitbite_v2_dev

DB_USERS_COLLECTION=users
DB_SESSIONS_COLLECTION=sessions
DB_FOODS_COLLECTION=foods
DB_ORDERS_COLLECTION=orders
DB_CARTS_COLLECTION=carts
DB_REVIEWS_COLLECTION=reviews
DB_MEAL_PLANS_COLLECTION=meal_plans
DB_DAILY_HEALTH_LOGS_COLLECTION=daily_health_logs
DB_NOTIFICATIONS_COLLECTION=notifications
DB_TRANSACTIONS_COLLECTION=transactions
DB_AUDIT_LOGS_COLLECTION=audit_logs
DB_SETTINGS_COLLECTION=settings

JWT_SECRET_ACCESS_TOKEN=
JWT_SECRET_REFRESH_TOKEN=
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

PASSWORD_PEPPER=

SHIPPING_ORIGIN_LAT=10.771638
SHIPPING_ORIGIN_LON=106.657018
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org/search
NOMINATIM_USER_AGENT=ECommerce_Student_Project/1.0
OSRM_BASE_URL=https://router.project-osrm.org

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

## Chạy dự án

Chuẩn bị DB mới và index theo [hướng dẫn database](../docs/database_schema.md#chuẩn-bị-database) trước khi seed/chạy server. Code không tự chuyển dữ liệu Order/Cart/Tracking cũ.

```bash
npm run dev
```

API mặc định chạy tại: `http://localhost:4000`.

## Build và chạy production

```bash
npm run build
npm run start
```

## Các lệnh chính

- `npm run dev`: chạy server với nodemon + tsx
- `npm test`: kiểm tra schema, đăng ký, xác thực và đánh giá món ăn bằng dữ liệu giả; không kết nối MongoDB
- `npm run build`: build TypeScript ra `dist`
- `npm run start`: chạy bản build
- `npm run lint`: kiểm tra lint
- `npm run lint:fix`: tự sửa lỗi lint cơ bản
- `npm run prettier`: kiểm tra format
- `npm run prettier:fix`: format code

[Hướng dẫn DB, seed Admin/Manager, Bcrypt và email reset](docs/auth-setup.md).

## Seed dữ liệu

- `npm run seed:admin`
- `npm run seed:manager`
- `npm run seed:foods`
- `npm run seed:cart`

## Cấu trúc thư mục (cấp 2)

```text
backend/
	docs/               # Tài liệu nội bộ
	postman/            # Collection và môi trường Postman
	scripts/            # Script seed và tiện ích
	src/
		constants/        # Hằng số, enum, message, HTTP status
		controllers/      # Xử lý request/response
		middlewares/      # Validate, auth, error handling
		models/           # Schema, type, request models
		routes/           # Định nghĩa endpoint
		services/         # Business logic và truy cập dữ liệu
		utils/            # Hàm tiện ích dùng chung
	uploads/            # File upload tĩnh
```

## API modules hiện có

- `/users`
- `/cart`
- `/orders`
- `/foods`
- `/tracking`
- `/reviews`
- `/medias`
- `/admin`
- `/uploads` (static files)

## CORS

Backend đang cho phép các origin:

- `http://localhost:3000`
- `https://e-commerce-mauve-xi.vercel.app`
- `https://e-commerce-git-haobranch-phongwd2311s-projects.vercel.app`
