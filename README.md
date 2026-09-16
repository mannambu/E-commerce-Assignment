# E-commerce Assignment

Monorepo gồm 2 phần chính:

- `frontend`: React + TypeScript + Vite
- `backend`: Node.js + Express + TypeScript + MongoDB

## Cấu trúc dự án

```text
E-commerce-Assignment/
  backend/
  frontend/
```

## Yêu cầu môi trường

- Node.js 18+
- npm 9+
- MongoDB (cho backend)

## Cài đặt nhanh

### 1) Backend

```bash
cd backend
npm install
```

Tạo file `.env` tại thư mục `backend` và cấu hình đầy đủ biến môi trường (xem chi tiết trong `backend/README.md`).

Chạy backend:

```bash
npm run dev
```

Backend mặc định tại `http://localhost:4000`.

### 2) Frontend

Mở terminal mới:

```bash
cd frontend
npm install
```

Tạo file `.env` tại thư mục `frontend`:

```env
VITE_API_URL=http://localhost:4000
```

Chạy frontend:

```bash
npm run dev
```

Frontend mặc định tại `http://localhost:3000`.

## Quy trình chạy local đề xuất

1. Chạy backend trước để đảm bảo API sẵn sàng.
2. Chạy frontend sau và kiểm tra gọi API.
3. Nếu bị lỗi CORS, cập nhật danh sách origin trong `backend/src/index.ts`.

## Scripts tham khảo

### Backend

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run seed:admin`
- `npm run seed:cart`
- `npm run seed:pt-services`

### Frontend

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

## Tài liệu chi tiết

- Backend: `backend/README.md`
- Frontend: `frontend/README.md`
