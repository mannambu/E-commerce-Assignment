# Manager xác nhận / từ chối đơn — backend

Phạm vi: AUTH-016, ORD-019 và bước xác nhận trong ADM-008/011. Chỉ xử lý **toàn đơn Pending**, gồm đơn lẻ hoặc cả gói tuần. Không phải API bắt đầu nấu, duyệt hủy hay từ chối riêng một ngày.

Quyết định người dùng đã chốt trong phiên làm việc:

- COD **trừ kho ngay khi đặt**, tạo Pending, thanh toán chưa thu; **không có hạn chờ Manager**.
- Đợt này hoàn thiện xác nhận/từ chối và **tạo yêu cầu hoàn**. Tích hợp IPN/hoàn tiền thật qua cổng thanh toán làm riêng.

## API

`PATCH /orders/:orderId/decision`

Header: `Authorization: Bearer <access_token của Manager>`.

Lấy `version` hiện tại từ `GET /orders/:orderId` hoặc `GET /orders/all`.

Xác nhận:

```json
{ "status": "Confirmed", "version": 0 }
```

Từ chối:

```json
{ "status": "Rejected", "version": 0, "reason": "Bếp quá tải" }
```

- `reason` bắt buộc khi từ chối, 1–500 ký tự sau trim. Khi xác nhận có thể bỏ trống.
- HTTP 200: `{ "message": "...", "result": { ...order, "replayed": false } }`.
- Gửi lại đúng quyết định, version, lý do và người thực hiện: `replayed: true`; không trừ/trả kho, ghi audit, thông báo hoặc yêu cầu hoàn lần nữa.
- 401: phiên không hợp lệ. 403: không phải Manager (kể cả Admin gửi `exceptionReason`). 404: không tìm thấy đơn. 422: body/ID sai. 409: version cũ, trạng thái không còn hợp lệ, kho hoặc thanh toán chưa đủ điều kiện.

## Quy tắc dễ kiểm tra

| Trường hợp | Kết quả |
| --- | --- |
| Đặt COD lẻ/tuần | Order và ngày giao Pending; kho Committed; tiền Pending. |
| Manager xác nhận COD | Pending → Confirmed; kho không bị trừ lần hai; tiền vẫn Pending. |
| Online chưa trả hoặc chỉ sửa `payment.status` thành Paid | Không xác nhận. Phải có Payment Succeeded từ VerifiedIPN, đúng phương thức, tiền khớp và kho Committed. |
| Online đã thu đủ tiền hợp lệ | Manager xác nhận; không tự chuyển Cooking. |
| Từ chối Pending chưa thu | Rejected; nhả phần giữ/trả phần đã trừ chưa chế biến đúng một lần; không tạo hoàn tiền. |
| Từ chối toàn đơn đã thu | Rejected; trả kho; tạo Transaction Refund Pending cho khoản đã thu còn chưa được dành để hoàn, bao gồm ship. |
| Có yêu cầu hoàn trước đó | Trừ số tiền đã dành cho yêu cầu cũ; không tạo hoàn trùng. Yêu cầu hoàn Failed vẫn cần xử lý lại chính yêu cầu đó. |
| Từ chối gói đã hủy vài ngày | Những ngày Cancelled giữ nguyên; các ngày Pending còn lại thành Rejected. Không cho quyết định nếu đã có ngày bắt đầu chế biến/hoàn thành. |
| Hai Manager quyết định đồng thời | Chỉ một thay đổi được ghi; yêu cầu xung đột nhận 409. |
| Online quá 15 phút chưa có IPN thành công | Job chuyển Cancelled, lý do “Quá hạn thanh toán”, nhả kho đúng một lần. |
| Paid còn Pending hoặc COD chờ Manager | Không bị job quá hạn online hủy. |

Tất cả thay đổi đơn, kho, yêu cầu hoàn, audit và bản ghi thông báo nằm trong cùng MongoDB transaction. Một bước lỗi thì hoàn tác toàn bộ. Lịch sử lưu Manager thực hiện, thời điểm và lý do. Thông báo hiện được lưu trong collection `notifications`; chưa bổ sung kênh đẩy real-time trong bước này.

`managerDecision.refundTransactionId` dẫn đến yêu cầu hoàn. `Refund Pending` **không có nghĩa tiền đã về**; thao tác từ chối không đổi Paid thành Refunded và không tăng `payment.refundedAmount`. Hoàn thật và kết quả từ cổng thanh toán thuộc bước tích hợp tiếp theo.

## Hạn online và dữ liệu cũ

- Đơn online mới dùng một mốc 15 phút: `inventoryHold.expiresAt` bằng `paymentDueAt`.
- Job dùng `paymentDueAt`; không nhả hàng ở phút 10 nữa. Đơn cũ có mốc hold 10 phút vẫn được giữ tới hạn thanh toán nếu chưa bị job cũ nhả.
- Đơn cũ đã Released còn trong hạn có thể thử thanh toán lại để giữ lại kho; không gia hạn `paymentDueAt`.
- Đơn cũ COD đã Confirmed không bị tự đổi về Pending. Không chạy migration trên dữ liệu dự án trong đợt này.
- Chưa có endpoint IPN thật: test dùng sổ giao dịch đã xác minh giả lập trên DB tạm. Không cung cấp API cho client tự đặt Paid.

## Kiểm thử

Chạy trong `backend`:

```powershell
npm.cmd test
npm.cmd run test:decisions:integration
npm.cmd run test:checkout:integration
npm.cmd run build
```

Integration test dùng replica set tạm, gồm HTTP/JWT, phiên bản, gửi lặp, cạnh tranh xác nhận/từ chối, trả kho, tiền hoàn gồm ship, timeout và rollback khi ghi thông báo lỗi. Không gửi tiền hoặc gọi cổng thanh toán thật.
