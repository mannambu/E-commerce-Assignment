# Frontend - E-commerce Assignment

Ứng dụng frontend được xây dựng bằng React + TypeScript + Vite.

## Yêu cầu môi trường

- Node.js 18+
- npm 9+

## Cài đặt

```bash
npm install
```

## Biến môi trường

Tạo file `.env` trong thư mục `frontend`:

```env
VITE_API_URL=http://localhost:4000
```

Ghi chú:
- Nếu không khai báo, hệ thống sẽ dùng mặc định: `https://e-commerce-7jh5.onrender.com`.
- Dự án đang đọc `import.meta.env.VITE_API_URL` trong `src/services/api.ts`.

## Chạy dự án

```bash
npm run dev
```

Mặc định Vite chạy tại: `http://localhost:3000`.

## Các lệnh chính

- `npm run dev`: chạy môi trường phát triển
- `npm run build`: build production
- `npm run preview`: chạy bản build local
- `npm run lint`: kiểm tra TypeScript (`tsc --noEmit`)

## Cấu trúc thư mục (cấp 2)

```text
frontend/
  public/             # Tài nguyên tĩnh
  src/
    components/      # UI components
    context/         # AuthContext, CartContext
    pages/           # Các trang auth/customer/dashboard
    services/        # API client và gọi backend
    lib/             # Utility helpers
```

## Luồng kết nối backend

- Frontend gọi API thông qua Axios instance tại `src/services/api.ts`.
- Access token được gắn tự động vào `Authorization` header.
- Khi gặp lỗi `401`, hệ thống tự gọi `/users/refresh-token` để lấy token mới.

## Ghi chú triển khai

- Khi upload file bằng FormData, không set cứng `Content-Type` để browser tự thêm boundary.
- Với môi trường deploy, cần cấu hình `REACT_APP_API_URL` trỏ đúng backend.
