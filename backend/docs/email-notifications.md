# Thông báo chỉ qua email

Theo xác nhận ngày 21/10/2026: dùng SMTP hiện có, không làm WebSocket hay danh sách/chuông thông báo trong ứng dụng. Chỉ thay đổi backend.

## Những sự kiện được gửi

| Sự kiện | Người nhận |
| --- | --- |
| Manager xác nhận/từ chối đơn COD | Chủ đơn |
| Tự hủy COD thành công hoặc Manager duyệt/từ chối hủy | Chủ đơn |
| Shipper báo giao COD thất bại | Chủ đơn |
| Manager cho giao lại/hủy sau Failed; job tự hủy Failed đủ 24 giờ | Chủ đơn |
| Manager phân công bếp hoặc gán/đổi shipper cho COD | Nhân viên được gán; gán shipper gửi thêm chủ đơn |
| Manager ghi nhận khoản COD thực thu bù/trả lại | Chủ đơn |
| Admin khóa/mở tài khoản | Tài khoản bị tác động, kể cả đang khóa |
| Admin ẩn đánh giá, kèm lý do | Tác giả |

Các thông báo DB khác vẫn giữ lịch sử nhưng không tự gửi mail: chế biến, xuất phát/giao thành công, yêu cầu hủy mới chờ duyệt. Không gửi IPN/online trong bước này. Email hủy hoặc từ chối có khoản đã thu không khẳng định tiền đã hoàn. Mã reset mật khẩu vẫn dùng luồng SMTP riêng như trước.

## Cách hoạt động

1. Ghi `notifications.email.status = Pending` cùng transaction nghiệp vụ. Rollback nghiệp vụ thì không còn email chờ gửi.
2. Khi bật, worker quét mỗi 15 giây, tối đa 20 thư/lượt, gửi tuần tự. Không cần Redis, broker hay thư viện mới.
3. Worker lấy địa chỉ từ tài khoản có `userId` tương ứng. Request khách hàng không được chọn người nhận.
4. Giữ bản ghi 5 phút bằng khóa riêng; thời gian gửi SMTP tối đa 30 giây/lần. Worker khác không lấy bản ghi đang được giữ. Lượt bị bỏ dở có thể được xử lý lại sau khi hết giữ.
5. SMTP nhận thư thì lưu `Sent` + `sentAt`. Thất bại thử lại sau 1, 5, 15, 60 phút; tối đa 5 lần rồi `Failed`. Thiếu tài khoản/địa chỉ không hợp lệ chuyển `Failed` ngay. Thiếu cấu hình SMTP không tiêu tốn lần thử.

Lỗi gửi mail không sửa trạng thái/tiền/kho của đơn đã commit. Lỗi ghi bản ghi hàng chờ trong transaction vẫn làm rollback để không mất sự kiện. Không ghi mật khẩu SMTP hoặc nguyên văn lỗi nhà cung cấp vào log/DB.

`Sent` chỉ nghĩa SMTP đã chấp nhận, không chứng minh thư đã vào inbox/được đọc. Nếu tiến trình chết sau khi SMTP nhận thư và trước khi DB ghi `Sent`, thử lại có thể gửi trùng. Message-ID được giữ ổn định; không bảo đảm nhà cung cấp tự loại trùng. Đây là giới hạn của cách dùng SMTP đơn giản.

## Bật gửi thật

Chưa bật worker, chưa gửi email thật và chưa sửa `.env` trong đợt triển khai này. Tại `backend/.env`, dùng cấu hình SMTP hiện có và bật rõ ràng:

```dotenv
EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM="Fitbite <sender@example.com>"
```

Xem [cấu hình SMTP](auth-setup.md). Khởi động lại backend sau khi cấu hình. Không bật flag hoặc đặt `false` thì worker không chạy; sự kiện mới vẫn xếp hàng để gửi sau khi bật. Chỉ bật khi SMTP trỏ đúng môi trường và bạn muốn gửi các thư đang chờ.

Không có migration nội dung: bản ghi cũ không có `email` sẽ không được gửi. Index mới phục vụ tốc độ quét đã nằm trong schema plan cho DB mới. Với DB hiện tại, có thể thêm hai index không unique bằng MongoDB client trên đúng collection `DB_NOTIFICATIONS_COLLECTION` (mặc định `notifications`):

```javascript
db.getCollection('notifications').createIndex(
  { 'email.status': 1, 'email.nextAttemptAt': 1 }, { name: 'notification_email_pending' }
)
db.getCollection('notifications').createIndex(
  { 'email.status': 1, 'email.leaseUntil': 1 }, { name: 'notification_email_leases' }
)
```

Chưa chạy các lệnh này trên DB dự án. Không chạy `schema:indexes --apply` trên DB đã có dữ liệu. Unique `notification_once` hiện có tiếp tục chống nhân sự kiện theo người nhận + eventKey.

## Checklist

- Xác nhận/hủy một đơn COD tạo đúng một email Pending; gọi lại thao tác không nhân email.
- Email đến đúng chủ đơn/tác giả/tài khoản bị khóa; không gửi cho người khác.
- Tắt SMTP thử nghiệm: thao tác nghiệp vụ vẫn thành công, email chờ thử lại.
- Bật lại SMTP thử nghiệm: lần gửi thành công ghi Sent, không gửi tiếp ở lượt quét sau.
- Bản ghi lịch sử không có `email` không bị gửi lại.
- `npm run test:notifications:integration` dùng MongoDB tạm và mock SMTP, không gửi thư thật.

FR-NTF-005 về tắt mức Tin chưa được triển khai vì chưa có email Tin/quảng bá; không coi lựa chọn kênh email là đã hoàn thiện tính năng này. Không có giao diện quản lý hàng chờ hoặc API gửi lại Failed trong đợt này; Failed được giữ để vận hành kiểm tra, không âm thầm bỏ qua hay tự xóa.
