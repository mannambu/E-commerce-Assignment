# Deploy mới: Render + Vercel

Frontend React/Vite chạy trên Vercel, backend Express chạy trên Render, database dùng MongoDB Atlas. Các domain trong hướng dẫn là ví dụ, phải thay bằng domain được cấp cho dự án mới.

## 1. Chuẩn bị code và database

- Commit và push code lên GitHub, chọn đúng branch để deploy cả hai dịch vụ. Không commit `.env`.
- Có thể giữ database Atlas hiện tại hoặc tạo database mới. Nếu giữ dữ liệu tài khoản cũ, giữ nguyên `PASSWORD_PEPPER` đang dùng.
- Đặt `DB_URI` và `DB_NAME` trỏ tới database mong muốn. Atlas cần database user và Network Access cho phép các outbound IP của dịch vụ Render (xem trong dashboard Render).
- Nếu dùng database mới, xem [hướng dẫn database](database_schema.md) để tạo index và seed dữ liệu. Các lệnh này ghi dữ liệu: chỉ chạy sau khi xác nhận đúng database đích. Không chạy seed trong Build Command.

## 2. Tạo backend mới trên Render

Trong Render, chọn **New → Web Service**, kết nối repository GitHub và chọn branch vừa push.

| Cấu hình | Giá trị |
| --- | --- |
| Language/Runtime | Node |
| Root Directory | `backend` |
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Khai báo Environment Variables dựa trên `backend/.env` của bạn; không đưa bí mật vào frontend:

```env
NODE_ENV=production
NODE_VERSION=22
DB_URI=<connection-string-MongoDB-Atlas>
DB_NAME=<ten-database>
JWT_SECRET_ACCESS_TOKEN=<chuoi-bi-mat>
JWT_SECRET_REFRESH_TOKEN=<chuoi-bi-mat-khac>
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
PASSWORD_PEPPER=<pepper-cua-database-dang-dung>
CORS_ORIGINS=http://localhost:3000
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
SHIPPING_ORIGIN_LAT=<vi-do-diem-giao-hang>
SHIPPING_ORIGIN_LON=<kinh-do-diem-giao-hang>
```

Giữ các biến `DB_*_COLLECTION` nếu database dùng tên collection tùy chỉnh. Khai báo thêm SMTP và `EMAIL_NOTIFICATIONS_ENABLED=true` nếu dùng gửi email thông báo; xem tài liệu backend. Các giá trị `<...>` chỉ là chỗ điền, không dùng nguyên văn.

Render tự cung cấp `PORT`; code đã đọc biến này. Không cần đặt `PORT=4000` trên Render.

Deploy backend và ghi lại URL mới, ví dụ `https://<backend-moi>.onrender.com`. Mở `/health` trên URL đó; kết quả mong đợi là `{"status":"ok"}`. Nếu startup thất bại, xem Render Logs và kiểm tra DB_URI, DB_NAME, Atlas Network Access.

## 3. Tạo frontend mới trên Vercel

Chọn **Add New → Project**, import cùng repository, chọn branch cần deploy.

| Cấu hình | Giá trị |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x |

Thêm biến sau cho Production (và Preview nếu dùng chung backend):

```env
VITE_API_URL=https://<backend-moi>.onrender.com
```

Không thêm `/api`, không dùng localhost. Biến `VITE_*` được đưa vào mã chạy trong trình duyệt: không đặt JWT secret, mật khẩu database hay Cloudinary API secret ở đây.

Bấm Deploy và ghi lại domain production của frontend. `frontend/vercel.json` đã cấu hình rewrite để tải lại trang con không bị 404.

## 4. Kết nối hai dịch vụ

Quay lại Render và đổi `CORS_ORIGINS` thành domain production vừa nhận:

```env
CORS_ORIGINS=https://<frontend-moi>.vercel.app
```

Nếu cần nhiều origin, phân tách bằng dấu phẩy, ví dụ thêm `http://localhost:3000`. Lưu và redeploy backend để áp dụng. Mỗi domain preview khác cần được thêm riêng nếu muốn truy cập API.

Khi đổi `VITE_API_URL`, phải redeploy frontend vì Vite nhúng giá trị lúc build.

## 5. Kiểm tra

- Backend `/health` trả về HTTP 200.
- Frontend tải được danh sách món, đăng ký/đăng nhập và gọi API trên domain Render mới.
- Upload ảnh hoạt động với Cloudinary.
- Tải lại một trang con không bị 404.
- Nếu gặp lỗi CORS, đối chiếu chính xác origin frontend với `CORS_ORIGINS` trên Render.

Render Free có thể ngủ sau 15 phút không có lưu lượng truy cập. Khi dịch vụ ngủ, các job `setInterval` kiểm tra tồn kho, giao hàng và email không chạy. Nếu cần job chạy liên tục, dùng dịch vụ không ngủ hoặc chuyển job sang scheduler/worker phù hợp.

## Tài liệu chính thức

- [Render: deploy Node/Express](https://render.com/docs/deploy-node-express-app)
- [Render: free services](https://render.com/docs/free)
- [Vercel: Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [MongoDB Atlas: IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
