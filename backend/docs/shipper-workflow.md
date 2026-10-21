# Shipper — API và kiểm tra backend

Tham chiếu AUTH-021, ORD-021/022/024, PAY-004 và ADM-013. Chỉ thay đổi backend, không chia ca.

## Các quyết định đã chốt

- COD gói tuần thu theo từng ngày giao; phí ship lấy đúng trên ngày đó. Không cộng khoản thiếu hoặc trừ khoản thừa của ngày khác vào số phải thu.
- Mọi lần giao thất bại phải có lý do; ảnh minh chứng tùy chọn, có thể bỏ `evidenceUrls` hoặc gửi `[]`.
- Gói có ngày Failed vẫn giữ tiến độ của các ngày đang xử lý và có `hasFailedDeliveries: true`.

## Một API theo công đoạn

`PATCH /orders/:orderId/deliveries/:deliveryId/shipper-status`

Cần JWT của **Delivery Staff Active được gán đúng ngày giao**. Đơn lẻ cũng dùng `deliveryId`. Manager, bếp, Customer và Admin không được gọi API vận hành này.

| Thao tác | Body mẫu | Điều kiện |
| --- | --- | --- |
| Nhận hàng và xuất phát | `{ "status": "Delivering", "version": 3 }` | Ngày giao Ready, đã được Manager gán. |
| Giao online thành công | `{ "status": "Completed", "version": 4 }` | Đang Delivering; thanh toán online đã xác thực. |
| Giao COD thành công | `{ "status": "Completed", "version": 4, "codCollectedAmount": 70000 }` | Đang Delivering; bắt buộc số thực thu nguyên VND, không âm. |
| Giao thất bại | `{ "status": "Failed", "version": 4, "reason": "Khách vắng nhà" }` | Đang Delivering; lý do 1–500 ký tự. Có thể thêm `evidenceUrls` với tối đa 10 URL ảnh HTTPS. |

`version` thuộc toàn đơn, lấy từ `/workspace/orders`. API kết quả giao chỉ kiểm tra định dạng URL, không tải hay xác minh nội dung ảnh. Mỗi URL tối đa 2048 ký tự, không chứa thông tin đăng nhập.

### Upload ảnh lên Cloudinary

Dùng API backend hiện có `POST /medias/upload-image`, với JWT của shipper và body `multipart/form-data`, trường file tên `image` (tối đa 5 MB mỗi lần). Backend upload lên Cloudinary và trả `{ "message": "Upload ảnh thành công", "result": ["https://res.cloudinary.com/..."] }`.

Lấy `result[0]` đưa vào `evidenceUrls` khi gọi `shipper-status`. Nếu có nhiều ảnh, upload từng ảnh rồi gửi các URL nhận được, tối đa 10 ảnh. Không có ảnh thì bỏ `evidenceUrls` hoặc gửi `[]`, không cần gọi API upload.

Backend dùng cấu hình trong `backend/.env`: `CLOUDINARY_CLOUD_NAME` là tên cloud; `CLOUDINARY_API_KEY` và `CLOUDINARY_API_SECRET` dùng xác thực upload. Thông tin này chỉ do backend đọc; request upload của shipper chỉ gửi JWT và file, không gửi khóa Cloudinary.

Response thường: `{ result: { orderId, deliveryId, status, version, changed, deliveryResult? } }`.

Gửi lại cùng người, cùng body và version của thao tác đã thành công trả `changed: false, replayed: true`; không ghi tiền/calo/audit lặp. Gửi kết quả khác hoặc số tiền khác với version cũ trả 409. Shipper không có quyền sửa kết quả đã chốt; sai lệch cần Manager đối soát.

## Tiền COD và kết quả giao

- Ngày `Completed` lưu số phải thu, thực thu, chênh lệch và người/thời điểm ghi nhận trong `deliveryResult`. `codDifference = codCollectedAmount - codExpectedAmount`.
- Số thực thu lớn hơn 0 tạo một Payment Transaction Succeeded, nguồn CODCollection, có `deliveryId` và `createdBy`. Số 0 vẫn là kết quả hợp lệ nhưng không tạo giao dịch thu tiền giả.
- `payment.paidAmount` là tổng thực thu. Nếu tổng chưa đủ, payment vẫn Pending dù ngày đã Completed. Khi đủ, payment thành Paid; khoản hoàn đã ghi nhận giữ nhãn PartiallyRefunded theo mô hình hiện có.
- Thu thiếu/thừa đặt `payment.codReconciliationRequired: true`; không sửa giá, tự thu bù hoặc tự hoàn tiền. Manager ghi khoản thực tế thu bù/trả lại qua API đối soát; cờ được tính lại từ `codSettlement`, còn chênh lệch shipper khai ban đầu vẫn giữ nguyên. Trạng thái Paid không thay thế việc kiểm tra cờ đối soát.
- Giao thất bại lưu lý do, ảnh, `failedAt` và lịch sử; không ghi tiền COD, calo, hoàn tiền hoặc trả kho. Không được chuyển Failed → Delivering/Completed bằng API shipper.

Với gói tuần có ngày Failed, trạng thái tổng lấy công đoạn sớm nhất của các ngày còn đang xử lý; cờ Failed được giữ riêng. Khi không còn ngày nào đang xử lý và vẫn còn Failed (các ngày khác chỉ Completed/Cancelled), trạng thái tổng là Failed, không báo hoàn tất. Đơn lẻ Failed có trạng thái tổng Failed.

## Dữ liệu để kiểm tra

`GET /workspace/orders` vẫn chỉ trả phần shipper được gán ở Ready/Delivering/Failed, thêm `paymentMethod`, `codExpectedAmount`, `deliveryResult`, `failedAt`, `hasFailedDeliveries`. Bếp không nhận các trường tiền này. Completed rời danh sách công việc đang xử lý; retry thao tác vẫn được kiểm tra theo dữ liệu đã lưu.

Manager/Admin đọc `deliveryResult` của từng ngày trên workspace hoặc chi tiết đơn; sổ `/workspace/transactions` có `deliveryId`, `method`, `source`, `createdBy` để đối chiếu. Manager xử lý chênh lệch bằng [API đối soát COD](manager-cod-operations.md).

## Checklist

1. Gán shipper cho Ready, dùng chính token đó chuyển Delivering. Shipper khác hoặc người được gán một ngày khác nhận 403.
2. Không nhảy Ready → Completed, không xuất phát trước ngày giao, kho phải Committed; online cần Payment Succeeded từ VerifiedIPN.
3. COD ngày đầu 50.000 + ship 20.000: thử thu 70.000/60.000/80.000/0. Kiểm tra thực thu, chênh lệch và cờ đối soát. Ngày sau không cộng lại ship hay khoản thiếu ngày trước.
4. Gửi lại Completed đồng thời: chỉ một giao dịch và một lần ghi calo. Hai kết quả Completed/Failed đồng thời: chỉ một kết quả thắng.
5. Failed thiếu lý do bị chặn; không gửi ảnh hoặc gửi `evidenceUrls: []` đều hợp lệ. Nếu gửi ảnh, URL vẫn phải hợp lệ. Failed không đổi kho hay thanh toán, không cộng calo, không tự mở quyền giao lại.
6. Ngày Completed cộng calo ngay trong cùng transaction; lỗi audit/thông báo/calo làm rollback kết quả và COD. Review chỉ được mở cho món nằm trong chính ngày Completed, không cần đợi cả gói.

## Phần còn lại

Manager xử lý Failed → Ready hoặc hủy/yêu cầu hoàn, job đủ 24 giờ và ghi nhận thu bù/trả lại đã có cho COD: xem [hướng dẫn Manager](manager-cod-operations.md). Thông báo lưu DB cùng transaction; Failed của COD được gửi [email](email-notifications.md) sau commit. Không gửi mail từng bước Delivering/Completed; không dùng WebSocket. Review kiểm tra chính ngày Completed và giới hạn một review cho mỗi bộ Order–Delivery–Food; có sửa trong 7 ngày, Admin ẩn có lý do, audit và email. Database cũ cần chuyển dữ liệu/index theo [hướng dẫn review](reviews-workflow.md).

## Chạy kiểm thử

Trong thư mục `backend`:

```powershell
npm run test:shipper:integration
npm run test:operations:integration
npm test
npm run build
```

Integration test dùng replica set MongoDB tạm; không dùng hoặc thay đổi DB dự án.
