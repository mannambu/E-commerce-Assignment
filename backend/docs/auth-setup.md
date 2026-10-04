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
PASSWORD_RESET_URL=http://localhost:3000/reset-password
```

`SMTP_SECURE=true` cho kết nối TLS trực tiếp, thường là cổng 465; cổng 587 dùng `false` để nâng cấp STARTTLS. SMTP local không yêu cầu đăng nhập có thể bỏ `SMTP_USER` và `SMTP_PASSWORD`. [Tài liệu Nodemailer SMTP](https://nodemailer.com/smtp).

Khởi động lại backend sau khi sửa `.env`. `JWT_SECRET_FORGOT_PASSWORD_TOKEN` không còn được sử dụng: reset dùng token ngẫu nhiên, không dùng JWT. Giữ hai JWT secret access/refresh riêng biệt.

1. Dùng một tài khoản có email nhận thư thật; các địa chỉ `.test` không nhận được email Internet. Có thể tạo Customer bằng đăng ký hoặc tạo Manager bằng Admin.
2. `POST /users/forgot-password` với `{ "email": "..." }`.
3. API trả thông báo chung, **không trả token**. Thiếu SMTP/reset URL trả 503 cho mọi email. Nếu SMTP gửi lỗi, API vẫn trả thông báo chung để không lộ tài khoản; server ghi thông báo lỗi chung và hủy token chưa gửi.
4. Lấy `user_id` và `forgot_password_token` từ liên kết trong email, gửi `POST /users/reset-password` với hai field đó, `password` và `confirm_password`.
5. Mật khẩu được đổi sang Bcrypt, token reset bị xóa, `tokenVersion` tăng và mọi session cũ bị xóa. Đăng nhập lại bằng mật khẩu mới.

Link có hạn 15 phút, chỉ dùng một lần. Gửi lại sau ít nhất một phút sẽ thay token cũ. DB chỉ lưu hash của token. Reset không tự mở khóa tài khoản bị Admin khóa.

Backend đã có luồng gửi/reset; **frontend vẫn cần trang `/reset-password`** đọc query và gọi API. Trước khi có trang này, thử đầy đủ bằng email + Postman như trên.

## 6. API và quyền

| API                                       | Quyền / hành vi                                                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /users/register`                    | Công khai, chỉ tạo Customer.                                                                                                                                                    |
| `POST /users`                             | Admin tạo Customer hoặc Manager; không tạo Admin qua API. Body giống register nhưng `role` bắt buộc.                                                                            |
| `PATCH /users/:user_id/status`            | Admin khóa/mở Customer/Manager; body `{ "status": "Locked" }` hoặc `Active`. Ghi audit, xóa khóa tạm/reset token, tăng version và thu hồi mọi phiên.                            |
| `POST /users/logout`                      | Body có refresh token còn hiệu lực; không cần access token còn hạn. Thu hồi cả access/refresh của phiên đó.                                                                     |
| `POST /users/logout-all`                  | Bearer access token; thu hồi mọi phiên của chính tài khoản.                                                                                                                     |
| `POST /users/refresh-token`               | Xoay refresh token, giữ thời hạn phiên. Frontend phải lưu cặp token mới; hai request dùng cùng token chỉ một request thành công. Response là `{ access_token, refresh_token }`. |
| `GET /orders/all`, `GET /orders/:orderId` | Admin/Manager được đọc mọi đơn; Customer chỉ đọc chi tiết đơn của mình.                                                                                                         |
| Tạo/quote/retry thanh toán đơn            | Chỉ Customer.                                                                                                                                                                   |
| Đổi trạng thái đơn/thanh toán, CRUD món   | Chỉ Admin. Manager không được thực hiện.                                                                                                                                        |

Token cũ thiếu liên kết session sẽ trả 401 sau cập nhật; cần đăng nhập lại. Không cần xóa DB hoặc tạo lại index cho thay đổi này. 401 từ protected API yêu cầu frontend refresh hoặc về đăng nhập; 403 là không có quyền.

Phạm vi chưa làm trong đợt này: báo cáo tài chính/Excel từ Transaction cho Manager, thay dashboard doanh thu Admin cũ bằng dashboard vận hành, tìm kiếm/phân trang quản lý user, API đổi role, giao diện quản lý user/reset mật khẩu và luồng guard phía frontend. `isManagerValidator` đã có để bảo vệ các API báo cáo khi triển khai chúng.

## 7. Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Test dùng DB giả và SMTP giả; kiểm tra JWT/Bcrypt thật, logout, logout-all, refresh đồng thời, reset hết hạn/đã dùng, khóa/mở, tạo Manager và quyền đọc đơn. Cần thử thêm trên Atlas + SMTP của bạn để xác nhận quyền DB, transaction và khả năng gửi thư thực tế.
