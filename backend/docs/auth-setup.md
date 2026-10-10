# Thiết lập DB, tài khoản và xác thực

## 1. Mở đúng thư mục

```powershell
Set-Location 'E:\252\ElectronicCommerce\Assigment\E-commerce-Assignment\backend'
npm.cmd install
```

Các lệnh bên dưới chạy trong `backend`, nơi có `package.json` và `.env`.

## 2. Kiểm tra kết nối DB

Trong `backend/.env`, cập nhật các biến đã có, tránh khai báo trùng:

```dotenv
DB_URI="mongodb+srv://<USER>:<PASSWORD>@<HOST_CLUSTER_MOI>/?retryWrites=true&w=majority"
DB_NAME=fitbite_v2_dev
DB_USERS_COLLECTION=users
DB_SESSIONS_COLLECTION=sessions
DB_FOODS_COLLECTION=foods
DB_CARTS_COLLECTION=carts
DB_AUDIT_LOGS_COLLECTION=audit_logs
```

Backend, tất cả seed và script `schema:indexes -- --apply` dùng cùng `DB_URI` + `DB_NAME`. Không cần biến kết nối riêng cho schema. Không còn hostname dự phòng trong code; thiếu cấu hình sẽ báo lỗi. `DB_USERNAME`/`DB_PASSWORD` không còn được dùng để ghép URI. Giữ các biến collection khác, JWT và Cloudinary đang có. Mật khẩu có ký tự đặc biệt trong URI cần percent-encode.

DB cần Atlas hoặc MongoDB replica set để chạy transaction khi reset mật khẩu, khóa tài khoản và tạo nhân viên. DB mới rỗng cần áp dụng index theo `docs/database_schema.md` **trước khi import/seed**. Nếu đã import users và đã tạo index, không chạy lại script khởi tạo DB rỗng.

## 3. Tạo Admin và Manager

Thêm vào `.env` và thay mật khẩu mẫu bằng mật khẩu của bạn:

```dotenv
SEED_ADMIN_EMAIL=admin@fitbite.test
SEED_ADMIN_USERNAME=admin_demo
SEED_ADMIN_PASSWORD="Admin123456!"
SEED_MANAGER_EMAIL=manager@fitbite.test
SEED_MANAGER_USERNAME=manager_demo
SEED_MANAGER_PASSWORD="Manager123456!"
```

```powershell
npm.cmd run seed:admin
npm.cmd run seed:manager
```

- Chưa tồn tại: tạo tài khoản Active, mật khẩu Bcrypt, ghi audit `UserCreated`.
- Đã có đúng email/username/role: bỏ qua, giữ mật khẩu và trạng thái hiện tại.
- Email hoặc username thuộc tài khoản khác: báo lỗi, không tự nâng quyền tài khoản đó.
- Script không in mật khẩu ra terminal. Chạy seed không phải cách đổi mật khẩu.

Nếu đã import bốn user mẫu trước đây, hai lệnh seed sẽ bỏ qua Admin/Manager trùng khớp. Đăng nhập bằng mật khẩu đã import. SHA-256 cũ tự chuyển sang Bcrypt sau lần đăng nhập đúng đầu tiên; **giữ nguyên `PASSWORD_PEPPER` cũ** cho đến khi mọi tài khoản cũ đã chuyển đổi. Mật khẩu Bcrypt mới không dùng pepper này.

`npm.cmd run data:users` tạo lại file JSON Bcrypt cục bộ, không kết nối DB. Không cần import lại nếu đã có tài khoản; import lặp không cập nhật mật khẩu và có thể báo duplicate key.

Có thể tạo dữ liệu món/giỏ để phát triển:

```powershell
npm.cmd run seed:foods
npm.cmd run seed:cart
```

Foods chỉ thêm món chưa có theo tên. Bỏ các gói tuần kiểu cũ vì gói tuần hiện gồm các món và ngày giao trong Cart/Order. Cart tạo tài khoản demo `seed.customer@ecommerce.local`, mật khẩu `Customer123!`, và giỏ mẫu nếu chưa có; giữ giỏ đã tồn tại. Đây là dữ liệu development.

## 4. Chạy và thử đăng nhập

```powershell
npm.cmd run dev
```

Gửi `POST http://localhost:4000/users/login` bằng Postman:

```json
{ "identifier": "admin@fitbite.test", "password": "Admin123456!" }
```

Response vẫn là `{ message, result: { access_token, refresh_token, role } }`. `identifier` nhận email hoặc username; cũng chấp nhận field `email`. JWT có `role`, `sessionId`, `tokenVersion`. Backend đối chiếu user và session trong DB trên mỗi request, không tin riêng role từ client.

Mật khẩu tạo/reset cần 8–50 ký tự, tối đa 72 byte UTF-8 (Bcrypt có giới hạn byte). Bcrypt dùng cost 12 và salt ngẫu nhiên. [Tài liệu bcryptjs](https://www.npmjs.com/package/bcryptjs).

## 5. Cấu hình email reset

Điền cấu hình SMTP của dịch vụ email bạn dùng; có thể dùng SMTP thử nghiệm có giao diện xem hộp thư:

```dotenv
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASSWORD="<smtp-password>"
SMTP_FROM="Fitbite <dia-chi-gui-duoc-xac-nhan@example.com>"
```

`SMTP_SECURE=true` cho kết nối TLS trực tiếp, thường là cổng 465; cổng 587 dùng `false` để nâng cấp STARTTLS. SMTP local không yêu cầu đăng nhập có thể bỏ `SMTP_USER` và `SMTP_PASSWORD`. [Tài liệu Nodemailer SMTP](https://nodemailer.com/smtp).

Khởi động lại backend sau khi sửa `.env`. Reset gửi mã 6 chữ số qua email, không cần `PASSWORD_RESET_URL` hoặc tên miền frontend. `JWT_SECRET_FORGOT_PASSWORD_TOKEN` và `FORGOT_PASSWORD_TOKEN_EXPIRES_IN` không được sử dụng. Giữ hai JWT secret access/refresh riêng biệt.

1. Dùng một tài khoản có email nhận thư thật; các địa chỉ `.test` không nhận được email Internet. Có thể tạo Customer bằng đăng ký hoặc tạo Manager bằng Admin.
2. `POST /users/forgot-password` với `{ "email": "..." }`.
3. API trả thông báo chung, **không trả mã**. Cấu hình SMTP thiếu/sai định dạng trả 503 cho mọi email. Nếu SMTP gửi lỗi, API vẫn trả thông báo chung để không lộ tài khoản; server ghi thông báo lỗi chung và hủy mã chưa gửi.
4. Đọc mã trong email, gửi `POST /users/reset-password`:

```json
{
  "email": "email-da-dang-ky@example.com",
  "reset_code": "012345",
  "password": "NewPassword123!",
  "confirm_password": "NewPassword123!"
}
```

`reset_code` là **chuỗi** 6 chữ số, giữ cả số 0 ở đầu. Không gửi `user_id` hoặc `forgot_password_token` như luồng link cũ.

5. Mật khẩu được đổi sang Bcrypt, mã reset bị xóa, `tokenVersion` tăng và mọi session cũ bị xóa. Đăng nhập lại bằng mật khẩu mới.

Mã có hạn 15 phút, chỉ dùng một lần và cho phép tối đa 5 lần kiểm tra mỗi mã. Sai/hết hạn/đã dùng/hết lượt trả 401; dữ liệu không đúng định dạng trả 422. Gửi lại sau ít nhất 60 giây sẽ tạo mã mới và đặt lại số lần thử. Thời gian chờ vẫn áp dụng khi SMTP thất bại. DB lưu Bcrypt hash trong field cũ `forgot_password_token`, thêm `forgot_password_attempts` và `forgot_password_requested_at` khi yêu cầu mã; không cần chạy migration. Link/token cũ không còn dùng được, hãy yêu cầu mã mới. Reset không tự mở khóa tài khoản bị Admin khóa hoặc khóa tạm.

Import [Password-Reset.postman_collection.json](../postman/Password-Reset.postman_collection.json). Đặt `baseUrl` là địa chỉ backend đang chạy, `resetEmail` là email tài khoản đã đăng ký, `newPassword` là mật khẩu mới. Chạy request 1 để nhận mã, điền `resetCode` từ email rồi chạy request 2 và 3. Request 2 không tự chạy lại bước gửi mã. Khi triển khai public, chỉ đổi `baseUrl` sang địa chỉ HTTPS của backend; nội dung email không chứa URL. Frontend sau này chỉ cần form email, mã và mật khẩu mới gọi cùng hai API.

## 6. API và quyền

| API                                       | Quyền / hành vi                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /users/register`                    | Công khai, chỉ tạo Customer.                                                                                                                                                    |
| `POST /users`                             | Admin tạo Customer hoặc Manager; không tạo Admin qua API. Body giống register nhưng `role` bắt buộc.                                                                            |
| `GET /users` | Admin tìm kiếm/phân trang Customer/Manager bằng `search`, `role`, `status`, `page`, `limit`; trả `result: { items, page, limit, total }`. Không trả dữ liệu sức khỏe/xác thực. |
| `PATCH /users/:user_id/status` | Admin khóa/mở Customer/Manager; body `{ "status": "Locked", "reason": "Lý do" }` hoặc `Active`. Khi thay đổi: ghi audit, xóa khóa tạm/reset token, tăng version và thu hồi mọi phiên. |
| `PATCH /users/:user_id/role` | Admin đổi Customer ↔ Manager; body `{ "role": "Manager", "reason": "Phân công báo cáo" }`. Ghi audit, tăng version và thu hồi phiên. Không sửa role Admin. |
| `POST /users/logout`                      | Body có refresh token còn hiệu lực; không cần access token còn hạn. Thu hồi cả access/refresh của phiên đó.                                                                     |
| `POST /users/logout-all`                  | Bearer access token; thu hồi mọi phiên của chính tài khoản.                                                                                                                     |
| `POST /users/refresh-token`               | Xoay refresh token, giữ thời hạn phiên. Frontend phải lưu cặp token mới; hai request dùng cùng token chỉ một request thành công. Response là `{ access_token, refresh_token }`. |
| `GET /orders/all`, `GET /orders/:orderId` | Admin/Manager được đọc mọi đơn; Customer chỉ đọc chi tiết đơn của mình.                                                                                                         |
| Tạo/quote/retry thanh toán đơn            | Chỉ Customer.                                                                                                                                                                   |
| Đổi trạng thái đơn/thanh toán, CRUD món   | Chỉ Admin. Manager không được thực hiện.                                                                                                                                        |
| Giỏ hàng, tracking, sức khỏe/thực đơn, tạo/sửa review | Chỉ Customer; dữ liệu thuộc chính người gọi. |
| `GET /admin/dashboard-stats` | Admin xem số khách, món đang bán, tổng đơn và `orders.byStatus`; không trả trường doanh thu. |
| `GET /foods` | Công khai. Chỉ phiên Admin hợp lệ được xem cả món ẩn; token bị thu hồi/hết hạn hoặc tài khoản bị khóa chỉ xem danh mục công khai. |

`reason` bắt buộc cho khóa/mở/đổi role, từ 1–500 ký tự sau khi trim. Gửi cùng trạng thái/role hiện tại trả HTTP 200 với `changed: false`; không tạo audit lặp hoặc thu hồi phiên. Ngoại lệ: Admin gửi `Locked` cho tài khoản đang khóa tạm sẽ bỏ `locked_until`, chuyển thành khóa lâu dài (`changed: true`). Khi thay đổi thành công trả `changed: true`. Mở khóa và đổi role không làm sống lại token cũ; đổi role không tự mở khóa tài khoản đang Locked.

Token cũ thiếu liên kết session sẽ trả 401 sau cập nhật; cần đăng nhập lại. Không cần xóa DB hoặc tạo lại index cho thay đổi này. 401 từ protected API yêu cầu frontend refresh hoặc về đăng nhập; 403 là không có quyền.

Phạm vi còn lại: báo cáo tài chính/Excel từ Transaction cho Manager, giao diện quản lý user/reset mật khẩu và guard phía frontend. `isManagerValidator` đã có để bảo vệ các API báo cáo khi triển khai US-29. Frontend cũ cần đổi sang đọc `result.items` ở danh sách user, gửi lý do thao tác và dùng `orders.byStatus` thay cho `revenue` trên dashboard Admin. Hợp đồng chi tiết ở [frontend-api-spec.md](frontend-api-spec.md).

## 7. Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Test dùng DB giả và SMTP giả; kiểm tra JWT/Bcrypt thật, logout, logout-all, refresh đồng thời, reset hết hạn/đã dùng, khóa/mở, tạo Manager và quyền đọc đơn. Cần thử thêm trên Atlas + SMTP của bạn để xác nhận quyền DB, transaction và khả năng gửi thư thực tế.
