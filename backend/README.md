# Backend - E-commerce Assignment

Backend sử dụng Node.js + Express + TypeScript + MongoDB.

## Yêu cầu môi trường

- Node.js 18+
- npm 9+
- MongoDB (local hoặc cloud)

## Cài đặt

```bash
npm install
```

## Biến môi trường

Tạo file `.env` trong thư mục `backend`.

```env
PORT=4000

DB_USERNAME=
DB_PASSWORD=
DB_NAME=

DB_USERS_COLLECTION=users
DB_REFRESH_TOKENS_COLLECTION=refresh_tokens
DB_FOODS_COLLECTION=foods
DB_PT_SERVICES_COLLECTION=pt_services
DB_ORDERS_COLLECTION=orders
DB_CARTS_COLLECTION=carts
DB_REVIEWS_COLLECTION=reviews
DB_CHATS_COLLECTION=chats
DB_ANALYTICS_COLLECTION=analytics
DB_CALORIE_LOGS_COLLECTION=calorie_logs

JWT_SECRET_ACCESS_TOKEN=
JWT_SECRET_REFRESH_TOKEN=
JWT_SECRET_FORGOT_PASSWORD_TOKEN=
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
- `npm run build`: build TypeScript ra `dist`
- `npm run start`: chạy bản build
- `npm run lint`: kiểm tra lint
- `npm run lint:fix`: tự sửa lỗi lint cơ bản
- `npm run prettier`: kiểm tra format
- `npm run prettier:fix`: format code

## Seed dữ liệu

- `npm run seed:admin`
- `npm run seed:cart`
- `npm run seed:pt-services`

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
- `/pt`
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
