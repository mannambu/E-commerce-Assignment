# Dữ liệu tài khoản mẫu

File `users.json` là MongoDB Extended JSON để import vào collection `users` của database development `fitbite_v2_dev`. `_id` dùng ObjectId, các thời điểm dùng BSON Date. Đây là tài khoản giả, chỉ dùng cho phát triển.

| Email | Mật khẩu mẫu | Vai trò | Trạng thái |
| --- | --- | --- | --- |
| admin@fitbite.test | Admin123456! | Admin | Active |
| manager@fitbite.test | Manager123456! | Manager | Active |
| customer@fitbite.test | Customer123456! | Customer | Active |
| locked@fitbite.test | Customer123456! | Customer | Locked |

Tài khoản `locked` cố ý không có `locked_until`: dùng kiểm tra khóa vĩnh viễn, đăng nhập phải bị từ chối. Các tài khoản chưa có hồ sơ sức khỏe; Customer sẽ khai báo qua API khảo sát. Không tạo session giả: session được tạo khi đăng nhập. Role Manager chưa đồng nghĩa backend đã có đầy đủ chức năng báo cáo.

## Tạo lại file

Từ thư mục `backend`, chạy:

```powershell
npm.cmd run data:users
```

Script chỉ tạo file cục bộ, không truy cập MongoDB. Mật khẩu được hash theo `src/utils/crypto.ts` hiện tại: SHA-256 của mật khẩu ghép PASSWORD_PEPPER. Pepper được đọc từ cấu hình môi trường, không ghi vào file hay console. Phải dùng cùng PASSWORD_PEPPER khi chạy backend. Nếu đổi pepper thì tạo lại file; khi chuyển sang Bcrypt cần cập nhật script và hash của các tài khoản mẫu.

`users.json` được gitignore vì hash phụ thuộc cấu hình cục bộ; script và hướng dẫn vẫn được lưu trong source.

## Import bằng MongoDB Compass

1. Chạy `npm.cmd run schema:indexes -- --apply` trên DB mới rỗng trước khi import. Script index hiện sẽ từ chối DB đã có dữ liệu.
2. Kết nối Compass bằng URI của cluster mới, mở `fitbite_v2_dev` → `users`.
3. Chọn **Add Data → Import JSON or CSV file**, chọn `backend/data/import/users.json`, định dạng JSON, rồi Import.
4. Kiểm tra có bốn document; `_id` là ObjectId và `created_at`/`updated_at` là Date.
5. Dùng tài khoản Active ở bảng trên để thử đăng nhập. Backend phải trỏ đúng DB và dùng cùng PASSWORD_PEPPER với lúc tạo file.

Hướng dẫn Compass: https://www.mongodb.com/docs/compass/current/import-export/

Các ID/email/username cố định để dễ tham chiếu khi tạo dữ liệu mẫu tiếp theo. Import một lần vào DB mới; import lặp có thể báo duplicate key, không phải thao tác cập nhật tài khoản. Các địa chỉ `.test` không phải hộp thư thật để nhận email reset.
