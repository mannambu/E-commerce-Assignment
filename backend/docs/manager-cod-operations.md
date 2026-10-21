# Manager xử lý Failed và đối soát COD

Phạm vi backend COD: ORD-023/024, ADM-011/014. Không tích hợp cổng thanh toán. Mọi API dưới đây cần JWT của **Manager Active**; Admin/bếp/shipper/Customer không có quyền gọi API vận hành Manager này.

## Quyết định đã chốt

- Hủy ngày Failed giảm toàn bộ tiền món và phí ship thuộc ngày đó. Không chuyển ship sang ngày khác; giữ nguyên giá gốc để đối chiếu.
- Đối soát chỉ ghi khoản **đã thực tế thu bù hoặc đã trả lại khách**, có số tiền, lý do và mã tham chiếu. Không sửa số shipper khai, không đổi giá, không miễn khoản thiếu.
- COD thu từng ngày; không lấy khoản thừa của ngày A bù thiếu ngày B.
- Giao lại qua Ready và Manager gán shipper lại. Không chia ca. Ảnh khi báo Failed vẫn tùy chọn, lý do bắt buộc.

## API

| API | Chức năng |
| --- | --- |
| `GET /workspace/cod-issues?kind=All&page=1&limit=20` | Danh sách ngày cần xử lý; `kind=Failed` hoặc `COD` để lọc. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/failure-resolution` | Chọn giao lại hoặc hủy ngày Failed. |
| `GET /orders/:orderId/deliveries/:deliveryId/cod-reconciliation` | Sổ tiền và khoản thiếu/thừa của riêng ngày giao. |
| `POST /orders/:orderId/deliveries/:deliveryId/cod-reconciliation` | Ghi khoản thực thu bù hoặc thực trả lại. |

Danh sách phân trang theo **ngày giao**, mặc định 20, tối đa 100 dòng/trang; response `{ result: { items, total, page, limit } }`. Danh sách chỉ gồm COD. Ngày đã xử lý hết chênh lệch rời danh sách COD; ngày Failed vẫn nằm ở nhóm Failed cho tới khi được xử lý.

### Giao lại

```json
{ "action": "Retry", "version": 2, "reason": "Đã liên lạc được với khách, giao lại" }
```

Chuyển Failed → Ready; lưu lần Failed, lý do/ảnh cũ, shipper cũ và quyết định Manager vào `failureResolutions`. Xóa phân công, mốc xuất phát và kết quả hiện hành để tránh dùng lại thao tác cũ.

Sau đó Manager gọi `shipper-assignment` với version mới, có thể chọn lại người cũ. Shipper nhận hàng/xuất phát từ Ready như bình thường. Không thay ngày/giá/ship đã chốt; không đặt thêm món hoặc trừ kho lần nữa. Ngày Failed đã có khoản COD hoặc yêu cầu hoàn sẽ bị chặn giao lại để tránh thu trùng; cần xử lý tiền trước.

### Hủy ngày Failed

```json
{ "action": "Cancel", "version": 2, "reason": "Không thể giao cho khách" }
```

Ngày chuyển Cancelled và ghi khoản giảm `cancellation.creditedAmount = subtotal + shipping.totalFee`. Các ngày khác giữ nguyên. Không trả món đã nấu/hỏng thành hàng bán được; kho đã Committed giữ nguyên.

- Chưa thu COD: không tạo Refund.
- Có khoản thu được phân bổ đúng ngày: tạo yêu cầu Refund Pending cho phần còn phải trả lại, trừ khoản đã hoàn và yêu cầu hoàn đã tồn tại. Pending không có nghĩa khách đã nhận tiền.
- Khi đã trả tiền thực tế, Manager dùng API đối soát Refund bên dưới. Có thể ghi trả từng phần.

## Đối soát COD

GET trả `expectedAmount`, `collectedAmount`, `refundedAmount`, `pendingRefundAmount`, `balance`, số shipper khai ban đầu, giao dịch và lịch sử Manager.

`balance = phải thu - đã thu + đã trả lại`:

| Balance | Ý nghĩa | Thao tác |
| --- | --- | --- |
| Dương | Khách còn thiếu | Collect, chỉ khi ngày Completed. |
| Âm | Còn phải trả lại khách | Refund, khi ngày Completed hoặc Cancelled. |
| 0 | Không còn chênh lệch thực thu | Không ghi thêm khoản đối soát. |

Ví dụ ngày phải thu 70.000đ, shipper khai thực thu 60.000đ. Sau khi thực sự thu bù 10.000đ:

```json
{
  "action": "Collect",
  "version": 2,
  "amount": 10000,
  "reference": "PHIEU-THU-20261020-001",
  "reason": "Đã nhận thêm 10.000đ từ khách"
}
```

Nếu shipper thu 80.000đ, sau khi thực sự trả lại khoản thừa:

```json
{
  "action": "Refund",
  "version": 2,
  "amount": 10000,
  "reference": "PHIEU-CHI-20261020-001",
  "reason": "Đã trả lại tiền thu thừa cho khách"
}
```

Số tiền nguyên VND, lớn hơn 0 và không vượt khoản thiếu/thừa của chính ngày đó. Mã tham chiếu 1–120 ký tự, không dùng lại trên cùng đơn; lý do 1–500 ký tự. Không gửi Collect cho ngày Cancelled.

Ghi Payment/Refund Succeeded với nguồn Reconciliation, người thực hiện và mã tham chiếu. Nếu đã có yêu cầu Refund, ghi trả từng phần làm giảm phần còn chờ; `requestedAmount` giữ số yêu cầu ban đầu và `refundRequestId` liên kết chứng từ trả một phần. Khi trả hết phần còn chờ, yêu cầu được xác nhận Succeeded. Nếu có nhiều yêu cầu cũ, xử lý lần lượt từng yêu cầu.

`deliveryResult.codCollectedAmount` và `codDifference` của shipper giữ nguyên. `codSettlement` phản ánh số tiền hiện tại; `codReconciliations` lưu các lần xử lý. Cờ `payment.codReconciliationRequired` chỉ tắt khi các ngày kết thúc không còn chênh lệch/yêu cầu hoàn chờ xử lý. Payment Paid theo tổng tiền không thay thế việc kiểm tra chênh lệch từng ngày.

## Job 24 giờ

Job tự khởi động sau khi kết nối DB, chạy ngay lúc khởi động và quét mỗi 60 giây. Chỉ chọn **COD Failed** có `failedAt` đủ 24 giờ; xử lý giống Cancel, ghi actor System, audit và thông báo DB. Không tự đánh dấu đã trả tiền mặt.

Job và Manager cùng xử lý một ngày: chỉ một quyết định được ghi. Retry xóa mốc Failed cũ; nếu giao lại rồi Failed lần nữa, mốc 24 giờ bắt đầu từ lần mới. Đơn online không thuộc job này. Một đơn có sổ tiền không khớp sẽ được ghi log để kiểm tra; job tiếp tục các đơn còn lại.

## Kiểm tra nhanh

1. Failed → Retry → Ready: shipper cũ chưa được gán lại không thể xuất phát; lịch sử Failed còn nguyên.
2. Manager gán shipper → Delivering → Failed lần nữa: kiểm tra `failedAt` mới, job không dùng mốc cũ.
3. Hủy ngày đầu gói tuần 50.000đ + ship 20.000đ: giảm 70.000đ, ngày sau vẫn ship 0đ, không cộng kho.
4. Failed chưa thu: Cancel không sinh Refund. Dữ liệu Failed đã có thu: Cancel sinh Pending, chỉ sau Refund thực tế mới tăng `refundedAmount`.
5. Collect/Refund vượt chênh lệch hoặc mã tham chiếu trùng: 409, không đổi số tiền. Ghi từng phần hợp lệ cập nhật khoản còn lại.
6. Gửi lại cùng người/body/version của thao tác đã thành công: `changed: false`, không ghi tiền/audit lặp. Body khác dùng version cũ: 409; phải tải lại đơn.
7. Gửi job và Retry đồng thời: không có kết quả vừa Ready vừa Cancelled, không hoàn trùng. Lỗi audit/thông báo làm rollback toàn bộ thao tác.

Các phản hồi mutation gồm `orderId`, `deliveryId`, `status`, `orderStatus`, `version`, `hasFailedDeliveries`, `codSettlement`, `changed`. Version thuộc toàn đơn; đọc lại sau mỗi thay đổi.

## Vận hành và giới hạn

Thêm index `failed_delivery_timeout` vào kế hoạch `schema:indexes`; không tự chạy migration trên DB dự án. Sổ COD cũ có tiền nhưng thiếu `deliveryId`, sai phương thức hoặc không khớp tổng tiền trả 409 để đối chiếu dữ liệu, không tự phân bổ tiền sang ngày khác.

Thông báo được lưu cùng MongoDB transaction; kết quả xử lý Failed và đối soát COD được gửi [email](email-notifications.md) sau commit. Không dùng WebSocket theo quyết định 21/10/2026. Hủy COD thông thường đã có [luồng khách/Manager riêng](cod-cancellation-workflow.md), dùng chung sổ đối soát này để ghi khoản thực trả sau duyệt. Giao diện và cổng thanh toán ngoài phạm vi. API chỉ ghi nhận việc Manager xác nhận đã chuyển tiền mặt; không tự thực hiện chuyển tiền.

```powershell
npm run test:manager-operations:integration
npm run test:shipper:integration
npm test
npm run build
```

Integration test dùng MongoDB replica set tạm, không dùng DB dự án.
