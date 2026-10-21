# Phần 5 — Gói tuần và phí giao hàng

## Phân tích và lựa chọn

Đối chiếu yêu cầu mới nhất trong [func_request_ver2.0.md](../../docs/func_request_ver2.0.md), cập nhật quyết định bỏ đổi món sau đặt hàng ngày 20/10/2026:

| Phần | Cách triển khai | Vì sao |
| --- | --- | --- |
| Gói tuần | Một Order, một mã gói, bảy `deliveries` liên tiếp; mỗi ngày giữ món riêng | Schema đã hỗ trợ; không cần tạo thêm bảng gói hay bảy đơn độc lập |
| Phí ship | Giữ `distanceKm` và biểu phí hiện có; chỉ thu ngày đầu | Giữ đúng yêu cầu và tương thích cách gọi hiện tại |
| Lịch giao | Giờ cố định theo Việt Nam; lưu `scheduledAt` và `cutoffAt` từng ngày | Không phụ thuộc múi giờ máy chạy backend; khóa đúng ngày đã chốt |
| Cấu hình bếp | Admin đặt giờ chốt; chép thời hạn và chính sách vào đơn lúc đặt | Đổi cấu hình sau này không làm đổi điều kiện của đơn cũ |
| Món trong đơn | Cố định sau checkout cho cả đơn ngày và gói tuần | Không có API đổi món, yêu cầu/duyệt đổi hoặc bộ đếm lượt đổi |
| Hủy ngày | Xem trước khoản giảm/hoàn, rồi xác nhận bằng `version` | Tránh hủy theo chính sách đã thay đổi hoặc ghi đè thao tác khác |
| Trạng thái | Vận hành từng ngày; trạng thái gói tổng hợp từ các ngày còn hiệu lực | Giao xong ngày đầu không thể hoàn thành cả tuần |

Không có ngoại lệ đổi món cho Customer, Manager hoặc Admin, kể cả khi đơn Confirmed và còn trước cutoff. Các API đổi món/tìm món thay thế trong đơn đã được gỡ, gọi lại trả 404.

Giờ giao mặc định **12:00**, cutoff mặc định **20:00 ngày trước giao** và có cấu hình. Hủy COD trước cutoff theo điều kiện thanh toán; giảm/hoàn **100% tiền món và phí ship thuộc ngày hủy**. Món trong đơn luôn cố định; cutoff không mở quyền đổi.

## Khoảng cách và phí ship

`distanceKm` vẫn được gửi trong body. Có truyền, kể cả `0`, thì không gọi bản đồ. Nếu không truyền, giữ luồng Nominatim → OSRM hiện có. Backend từ chối số âm, NaN, Infinity và mảng.

| Chế độ | Khoảng cách | Phí ngày đầu |
| --- | --- | --- |
| FOOD / ONE_DAY | ≤ 2 km | 0 |
| FOOD / ONE_DAY | > 2 km | `ceil(distanceKm - 2) * 5000` |
| COMBO / WEEKLY_7D | < 5 km | 0 |
| COMBO / WEEKLY_7D | ≥ 5 km | 20.000đ |

Giữ nguyên ranh giới cũ: combo **đúng 5 km tính 20.000đ**. Ngày 2–7 có `shipping.totalFee = 0`; `waivedShippingFee` ghi phần được miễn. Tổng miễn nằm trong `quote.pricing.waivedShippingFee` và response Order. Hủy ngày đầu không chuyển phí sang ngày thứ hai và không thu lại ưu đãi những ngày còn lại.

## Quote và tạo gói

Customer dùng `POST /orders/quote`, xem lịch/giá/chính sách rồi gọi `POST /orders` với cùng cấu trúc:

```json
{
  "packageType": "WEEKLY_7D",
  "cartType": "COMBO",
  "deliveryDate": "2099-12-25",
  "deliveryTime": "11:30",
  "deliveryAddress": "Địa chỉ nhận hàng",
  "distanceKm": 6,
  "paymentMethod": "COD"
}
```

Ngày ví dụ cần thay bằng ngày bắt đầu trong giỏ thực tế. Giỏ phải có món cho đúng bảy ngày liên tiếp. `deliveryTime` dùng `HH:mm` theo giờ Việt Nam; bỏ trường này dùng 12:00. Có thể gửi `deliveryDate` dạng `2099-12-25T11:30:00+07:00` hoặc timestamp `Z`; khi đó không gửi thêm `deliveryTime`. Timestamp thiếu múi giờ, ngày không tồn tại, ngày đã qua, giờ giao trước giờ chốt hoặc cutoff đã hết đều bị từ chối.

Quote trả `deliveries[]`, giá từng ngày, `pricing`, `cancellationPolicy`, `targetCaloriesSnapshot`. Khi một món thiếu kho/ngừng bán, quote/create trả 400 với `issues[]` và `replacements[]`: dòng giỏ, ngày bị ảnh hưởng và tối đa năm món thay thế đã lọc dị ứng, dinh dưỡng, kho. Nếu không tìm được món thì danh sách rỗng kèm thông báo. Khách chủ động sửa giỏ bằng API cart rồi quote lại; không tự thay món. Trước checkout giá món thay thế có thể khác, vì tổng giá sẽ được tính lại.

COD tạo gói và các ngày ở `Pending`, thanh toán vẫn `Pending`, kho trừ ngay và không có hạn chờ Manager. Online cũng tạo Pending; IPN sau này ghi Paid/chốt kho nhưng giữ Pending. Manager xác nhận/từ chối toàn gói qua [API quyết định](manager-order-decisions.md).

## API từng ngày

Các endpoint bên dưới bắt buộc JWT. Customer chỉ sửa đơn của mình; Admin can thiệp ngoại lệ phải có `exceptionReason` và audit. Manager có API quyết định toàn đơn Pending và [phân công từng ngày](order-assignments.md) riêng. `itemId` là `_id` dòng trong `deliveries[].items[]`, không phải `foodId`.

| Method | Path | Dùng để |
| --- | --- | --- |
| GET | `/orders/:orderId/deliveries/:deliveryId/cancellation` | Xem khoản giảm/hoàn trước khi hủy |
| POST | `/orders/:orderId/deliveries/:deliveryId/cancel` | Hủy một ngày |
| PATCH | `/orders/:orderId/deliveries/:deliveryId/status` | Admin đổi trạng thái ngày |

Body hủy:

```json
{ "reason": "Không nhận được đồ ăn ngày này", "version": 0 }
```

Body đổi trạng thái:

```json
{ "status": "Cooking", "version": 0 }
```

`version` lấy từ chi tiết đơn hoặc preview hủy mới nhất, tăng sau mỗi sửa đổi. Version cũ trả 409, frontend tải lại trước khi thử tiếp. Gửi lặp đúng yêu cầu hủy đã thành công không thêm tiền hoàn hay nhả kho lần nữa.

Điều kiện hủy: ngày đang `Pending` hoặc `Confirmed`, chưa nấu và thời điểm hiện tại **nhỏ hơn** `cutoffAt`. Đúng cutoff là đã chốt. Hủy giữ bản chụp các món đã đặt để đối chiếu, chỉ cập nhật trạng thái và khoản giảm/hoàn.

Admin chuyển từng ngày theo `Confirmed → Cooking → Ready → Delivering → Completed`; không nhảy bước, quay ngược hay xử lý ngày giao tương lai. Online chỉ vào Cooking khi payment đã Paid/PartiallyRefunded và có Payment Transaction Succeeded từ VerifiedIPN. Bếp được phân công có API vận hành riêng `kitchen-status` cho Confirmed → Cooking → Ready, không cần lý do ngoại lệ Admin. Hoàn thành một ngày cập nhật theo dõi calo cho ngày đó. Gói chỉ Completed khi các ngày chưa hủy đều Completed, hoặc Cancelled khi cả bảy ngày đã hủy.

API chuyển trạng thái toàn đơn vẫn trả 400 cho gói tuần. Customer COD có thể dùng `PATCH /orders/:orderId/cancel` với `{ version, reason }` để hủy toàn bộ các ngày còn lại khi tất cả đủ điều kiện. Hủy phần đã thu COD phải chờ Manager duyệt; xem [luồng hủy COD](cod-cancellation-workflow.md).

## Khoản giảm, khoản đã trả và khoản chờ hoàn

`subtotal`, `shippingFee`, `grandTotal` trong Order và tiền từng ngày vẫn là giá trị lúc đặt. Không dùng `grandTotal` làm số phải thu sau khi có hủy ngày. Response gói tuần có:

| Trường `amounts` | Ý nghĩa |
| --- | --- |
| `creditedAmount` | Tổng giá trị được giảm do hủy ngày |
| `payableTotal` | Giá trị gói sau giảm |
| `paidAmount` | Tiền đã thu |
| `refundedAmount` | Tiền đã hoàn thành công |
| `pendingRefundAmount` | Khoản đã yêu cầu hoàn nhưng chưa ghi nhận hoàn thành |
| `amountDue` | Số còn phải trả sau khi tính cả khoản hoàn |

Ví dụ bảy ngày, mỗi ngày 50.000đ, ship ngày đầu 20.000đ: giá gốc 370.000đ. Hủy ngày đầu trước cutoff giảm 70.000đ, `payableTotal = 300000`. Nếu chưa trả thì `amountDue = 300000`, không tạo refund; nếu đã trả đủ thì `amountDue = 0` và tạo một Refund Transaction **Pending** 70.000đ.

Preview Customer COD trả `requiresApproval` và `lines[]` chứa khoản giảm/hoàn của từng ngày; xem [API hiện hành](cod-cancellation-workflow.md). Preview online/Admin hiện có vẫn trả `foodCredit`, `shippingCredit`, `creditedAmount`, `refundAmount`, `remainingPayable`, `refundStatus`, chính sách, cutoff và version. `cancellation.refundAmount` là khoản yêu cầu hoàn; không đồng nghĩa `delivery.refundedAmount` hay `payment.refundedAmount` đã tăng.

Hủy lưu Order, điều chỉnh kho đã giữ/trừ, AuditLog và yêu cầu hoàn tiền trong cùng MongoDB transaction. `NotReserved` không được cộng trả hàng vì chưa từng giữ/trừ. `Held` điều chỉnh reservedStock; `Committed` điều chỉnh stock. Cần MongoDB replica set/Atlas để chạy transaction.

## Admin cấu hình bếp

`GET /admin/commerce-settings` và `PATCH /admin/commerce-settings` chỉ dành cho Admin. Body PATCH:

```json
{ "kitchenCutoffTime": "20:00", "kitchenCutoffDaysBefore": 1 }
```

`kitchenCutoffDaysBefore` nhận 0 (cùng ngày) hoặc 1 (ngày trước). Nếu chọn cùng ngày, giờ giao phải muộn hơn giờ chốt. Khi DB chưa có settings, GET/quote dùng mặc định, không tự ghi DB. PATCH tạo/cập nhật một document `_id: "commerce"` kèm audit. Chính sách hoàn MVP hiện cố định như trên; PATCH chỉ chỉnh giờ chốt. Đơn cũ không thay đổi cutoff/policy.

## Phần nối tiếp

- Đợt này chỉ sửa backend. Response không còn `canSwap`; các API đổi món cũ trả 404. Giao diện cần dùng các API lịch, hủy và cấu hình giờ chốt hiện hành.
- Checkout đã có transaction, idempotency, giữ kho online 15 phút và trừ kho COD; xem [phần 6](checkout-inventory.md). Quote vẫn không giữ hàng.
- Thu COD theo ngày đã có trong [API Shipper](shipper-workflow.md); [API Manager](manager-cod-operations.md) xử lý ngày COD Failed và ghi nhận tiền thực tế thu bù/trả lại. Hủy ngày Failed bỏ cả tiền món và phí ship của ngày, không chuyển phí sang ngày khác, không trả món đã nấu về kho. Job hết hạn thanh toán và job COD Failed 24 giờ đã có; IPN và gọi cổng hoàn tiền chưa tích hợp. Không đánh dấu đã hoàn chỉ vì tạo yêu cầu Refund Pending.
- API sửa payment-status thủ công bị chặn cho cả gói tuần và đơn lẻ. Retry chỉ cho online Pending, chưa trả, còn hạn và chưa hủy ngày; giữ lại hàng nếu hold đã Released. Đơn đã hủy ngày cần đối soát lại số tiền. Phần IPN sắp tới phải xử lý cả callback đến muộn sau khi hủy và lấy số phải thu từ khoản thực tế sau giảm.
- Gói tuần COD phải có cutoff hợp lệ và kho Committed; sổ tiền phải phân bổ đúng ngày. Chính sách hủy COD áp dụng quyết định 20/10/2026, không dùng snapshot cũ để cho tự hủy phần đã thu. Luồng online/Admin vẫn kiểm tra snapshot chính sách hiện có. Không chạy migration hay sửa DB đang dùng.
- Test phần 5 dùng kho giả lập/HTTP cục bộ để kiểm tra API đổi món đã bị loại bỏ; phần 6 dùng MongoDB replica set tạm để kiểm tra checkout và hủy ngày cùng kho. Chưa kiểm thử cổng thanh toán.
