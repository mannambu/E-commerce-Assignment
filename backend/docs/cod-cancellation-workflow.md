# Khách hủy COD và Manager duyệt hủy

Tham chiếu FR-AUTH-016, FR-ORD-012/015/017/018; hoàn tiền nối vào đối soát COD đã có. Chỉ cập nhật backend và tài liệu.

## Quy tắc đã chốt

- Chỉ hủy cả đơn lẻ, cả một ngày gói tuần hoặc toàn bộ các ngày còn lại của gói. Không hủy lẻ món.
- Ngày bị hủy phải Pending/Confirmed, chưa từng nấu và còn trước cutoff. Đúng cutoff là đã chốt. Hủy toàn gói phải kiểm tra tất cả ngày còn lại; không hủy một phần nếu có ngày không hợp lệ.
- COD lẻ dùng chung cấu hình cutoff với gói tuần, mặc định 20:00 hôm trước. Checkout lưu cutoff cho từng ngày.
- Chưa có tiền thu trên phần bị hủy: tự hủy ngay. Đã có tiền thu, kể cả một phần: chờ Manager duyệt. Không lấy tiền của ngày đã giao để đánh dấu ngày khác đã trả.
- **Chốt 20/10/2026:** hủy ngày đầu miễn phí ship ghi trên ngày đó; đã thu thì đưa vào khoản hoàn. Không chuyển phí sang ngày sau. Giữ giá/ship gốc và lưu khoản giảm riêng.
- Chỉ tạo Refund Pending cho tiền thực thu còn phải trả, trừ khoản đã trả và yêu cầu hoàn đang tồn tại. Pending chưa phải tiền đã về khách; Manager ghi tiền thực trả qua [đối soát COD](manager-cod-operations.md).

## API để kiểm tra

| Vai trò | API | Ý nghĩa |
| --- | --- | --- |
| Customer | `GET /orders/:orderId/cancellation` | Xem trước hủy toàn đơn/các ngày còn lại. |
| Customer | `GET /orders/:orderId/deliveries/:deliveryId/cancellation` | Xem trước một ngày của gói tuần. |
| Customer | `POST /orders/:orderId/cancellation-requests` | Tự hủy hoặc tạo yêu cầu chờ duyệt. |
| Customer/Manager | `GET /orders/:orderId/cancellation-requests` | Lịch sử yêu cầu và version hiện tại; khách chỉ xem đơn mình. |
| Manager | `GET /workspace/cancellation-requests?page=1&limit=20` | Danh sách Pending, phân trang theo yêu cầu; tối đa 100 dòng/trang. |
| Manager | `PATCH /orders/:orderId/cancellation-requests/:requestId` | Duyệt hoặc từ chối. |

Khách gửi:

```json
{ "version": 0, "reason": "Thay đổi lịch nhận", "deliveryId": "<ID ngày giao>" }
```

Bỏ `deliveryId` để hủy toàn đơn/các ngày còn lại. Không gửi `itemId` hoặc danh sách món để hủy lẻ.

Manager gửi:

```json
{ "version": 1, "action": "Approve", "reason": "Đủ điều kiện hủy" }
```

Dùng `"action": "Reject"` khi từ chối. Lý do bắt buộc 1–500 ký tự. Version thuộc toàn đơn, phải tải lại sau mỗi thay đổi.

Response mutation: `{ result: { orderId, orderStatus, version, request, changed } }`.
`request.status` là Pending/Approved/Rejected, độc lập với trạng thái đơn. `automatic: true` nghĩa khách chưa trả và đã tự hủy thành công; `false` là luồng Manager. `request.decision` lưu người duyệt/từ chối, lý do, thời điểm.

Preview trả `{ result: { orderId, version, requiresApproval, wholePackage, lines } }`; từng dòng có `deliveryId`, `cutoffAt`, `foodCredit`, `shippingCredit`, `creditedAmount`, `refundAmount`. Preview không giữ chỗ quyền hủy; khi gửi/duyệt luôn kiểm tra lại.

API cũ cho Customer COD cũng đi qua cùng kiểm tra:

- `PATCH /orders/:orderId/cancel`: body `{ version, reason }`, phản hồi có `result` như trên.
- `POST /orders/:orderId/deliveries/:deliveryId/cancel`: body `{ version, reason }`, áp dụng ngày gói tuần; có thể trả yêu cầu Pending, không được mặc định đã hủy.
- Preview COD theo ngày đổi sang `lines`, cần đọc `lines[0]`.

Admin tiếp tục dùng luồng ngoại lệ đã có với `exceptionReason`; không có quyền gọi API duyệt thường ngày của Manager.

## Điều kiện duyệt và chống lặp

Gửi yêu cầu Pending chưa trả kho, chưa hủy, chưa tạo Refund. Bếp vẫn có thể xử lý đơn. Khi Manager duyệt, cutoff và điều kiện chưa nấu phải còn đúng; nếu không trả 409, Manager có thể Reject để đóng yêu cầu kèm lý do.

Mỗi phần chỉ có một yêu cầu Pending, không cho yêu cầu toàn đơn chồng lên yêu cầu ngày. Gửi lại cùng người, cùng body/version của thao tác thành công trả `changed: false`; không ghi kho, tiền hoặc audit lần hai. Nội dung khác với version cũ trả 409. Sau Reject, khách có thể gửi yêu cầu mới nếu vẫn đủ điều kiện.

Hủy và bếp bắt đầu nấu, hoặc Approve và Reject chạy đồng thời: chỉ một thao tác được chốt. Trả kho chưa chế biến, ghi Order, Refund, audit và thông báo cùng transaction; có lỗi sẽ rollback toàn bộ.

Đơn COD lẻ cũ chưa có cutoff sử dụng cấu hình chốt bếp hiện tại cho ngày giao đã lưu; snapshot được ghi khi thao tác thành công. Gói tuần thiếu cutoff, kho không khớp hoặc tiền cũ chưa phân bổ đúng ngày trả 409 để kiểm tra, không đoán cách phân bổ tiền/kho.

## Checklist

1. COD chưa thu trước cutoff: tự hủy, kho tăng đúng số món, không có Refund.
2. Đúng/sau cutoff hoặc ngày đã Cooking: bị chặn ở cả API cũ và mới.
3. Hủy ngày đầu 50.000đ + ship 20.000đ: giảm 70.000đ; các ngày sau không thêm ship.
4. Ngày 1 đã thu/giao, ngày 2 chưa thu: ngày 2 vẫn được tự hủy nếu đủ điều kiện.
5. Phần đã thu 12.000đ: gửi yêu cầu chưa đổi kho/tiền; duyệt tạo Refund Pending đúng 12.000đ.
6. Manager từ chối: giữ đơn/kho/tiền, lưu lý do và thông báo.
7. Sau khi đã trả tiền thực tế qua đối soát, `refundedAmount` mới tăng; gửi lặp không ghi thêm.
8. Hủy toàn gói có một ngày không hợp lệ: không ngày nào bị hủy dở dang.

Thông báo lưu DB trong transaction; kết quả tự hủy/duyệt/từ chối hủy được gửi [email](email-notifications.md) sau commit. Yêu cầu hủy mới chờ duyệt không gửi email; không dùng WebSocket theo quyết định 21/10/2026. Online và cổng thanh toán chưa đồng bộ trong bước này. Đã thêm index `pending_cancellation_requests` vào kế hoạch `schema:indexes`, chưa chạy trên DB dự án.

Kiểm thử: `npm run test:cancellations:integration`, `npm run test:checkout:integration`, `npm test`, `npm run build`. Integration dùng MongoDB tạm, không dùng DB dự án.
