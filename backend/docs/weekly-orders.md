# Phần 5 — Gói tuần và phí giao hàng

## Phân tích và lựa chọn

Đối chiếu US-30, US-17 và US-11 trong [func_request.md](../../docs/func_request.md):

| Phần | Cách triển khai | Vì sao |
| --- | --- | --- |
| Gói tuần | Một Order, một mã gói, bảy `deliveries` liên tiếp; mỗi ngày giữ món riêng | Schema đã hỗ trợ; không cần tạo thêm bảng gói hay bảy đơn độc lập |
| Phí ship | Giữ `distanceKm` và biểu phí hiện có; chỉ thu ngày đầu | Giữ đúng yêu cầu và tương thích cách gọi hiện tại |
| Lịch giao | Giờ cố định theo Việt Nam; lưu `scheduledAt` và `cutoffAt` từng ngày | Không phụ thuộc múi giờ máy chạy backend; khóa đúng ngày đã chốt |
| Cấu hình bếp | Admin đặt giờ chốt; chép thời hạn và chính sách vào đơn lúc đặt | Đổi cấu hình sau này không làm đổi điều kiện của đơn cũ |
| Đổi món | Đổi một dòng trong một ngày; kiểm tra giá, dinh dưỡng, dị ứng và kho | Giữ tổng giá đã chốt và không ảnh hưởng sáu ngày còn lại |
| Hủy ngày | Xem trước khoản giảm/hoàn, rồi xác nhận bằng `version` | Tránh hủy theo chính sách đã thay đổi hoặc ghi đè thao tác khác |
| Trạng thái | Vận hành từng ngày; trạng thái gói tổng hợp từ các ngày còn hiệu lực | Giao xong ngày đầu không thể hoàn thành cả tuần |

US-11 nói chặn swap sau checkout, nhưng US-30 cho đổi ngày trong gói tuần trước giờ chốt. Ở đây US-30 là ngoại lệ dành riêng cho `WEEKLY_7D`. Không mở đổi món đơn lẻ sau đặt.

Các lựa chọn MVP trong đợt này: giờ giao mặc định **12:00**, chốt **20:00 ngày trước giao**, đổi món **cùng đơn giá đã chốt**, hủy trước giờ chốt được giảm/hoàn **100% tiền món và phí ship đã thu của ngày đó**. Sau giờ chốt không cho tự đổi/hủy; xử lý ngoại lệ thuộc đối soát sau này.

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

COD tạo gói và các ngày ở `Confirmed`, thanh toán vẫn `Pending`. Online tạo ở `Pending`; phần IPN sau này phải xác nhận thanh toán rồi chuyển các ngày còn hiệu lực sang `Confirmed`.

## API từng ngày

Các endpoint bên dưới bắt buộc JWT. Customer chỉ sửa đơn của mình; Admin có quyền vận hành. Manager chỉ đọc danh sách/chi tiết đơn. `itemId` là `_id` dòng trong `deliveries[].items[]`, không phải `foodId`.

| Method | Path | Dùng để |
| --- | --- | --- |
| GET | `/orders/:orderId/deliveries/:deliveryId/items/:itemId/alternatives` | Lấy tối đa năm món đổi cùng giá |
| PATCH | `/orders/:orderId/deliveries/:deliveryId/items/:itemId` | Đổi một món |
| GET | `/orders/:orderId/deliveries/:deliveryId/cancellation` | Xem khoản giảm/hoàn trước khi hủy |
| POST | `/orders/:orderId/deliveries/:deliveryId/cancel` | Hủy một ngày |
| PATCH | `/orders/:orderId/deliveries/:deliveryId/status` | Admin đổi trạng thái ngày |

Body đổi món:

```json
{ "foodId": "ID_MON_MOI", "version": 0 }
```

Body hủy:

```json
{ "reason": "Không nhận được đồ ăn ngày này", "version": 0 }
```

Body đổi trạng thái:

```json
{ "status": "Cooking", "version": 0 }
```

`version` lấy từ chi tiết đơn hoặc kết quả preview/alternatives mới nhất, tăng sau mỗi sửa đổi. Version cũ trả 409, frontend tải lại trước khi thử tiếp. Lặp lại thao tác hủy một ngày đã hủy trả kết quả hiện có, không thêm tiền hoàn hay nhả kho lần nữa.

Điều kiện đổi/hủy: ngày đang `Pending` hoặc `Confirmed`, đơn chưa kết thúc và thời điểm hiện tại **nhỏ hơn** `cutoffAt`. Đúng giờ chốt là đã khóa. Đổi món giữ số lượng, ngày, bữa và ID dòng; cập nhật tên/ảnh/dinh dưỡng của món mới, bỏ tham chiếu thực đơn cũ của dòng đó.

Món đổi phải đang bán, đủ kho, cùng đơn giá trong OrderItem, calo lệch không quá ±15% món hiện tại, tổng ngày sau đổi lệch không quá ±10% `targetCaloriesSnapshot`. Nếu chưa có target, dùng tổng calo ngày trước đổi làm mốc. Lọc cả `allergies` và `dietaryRestrictions` hiện tại của chủ đơn, kể cả trường kiêng kỵ nằm trong `allergies` của hồ sơ cũ. Thay đổi cân nặng/mục tiêu sau đặt không tự đổi target của đơn đang chạy.

Response đổi món có `calories`, `nutritionTotals` (calories/protein/carb/fat), `calorieDifference`, `targetCalories`, `targetDifference`, `warnings` và Order mới. Macro thay đổi được báo để frontend hiển thị, không tự chặn chỉ vì macro đổi.

Admin chuyển từng ngày theo `Confirmed → Cooking → Delivering → Completed`; không nhảy bước, quay ngược hay xử lý ngày giao tương lai. Online chỉ vào Cooking khi payment đã Paid/PartiallyRefunded và có Payment Transaction Succeeded từ VerifiedIPN. Hoàn thành một ngày cập nhật theo dõi calo cho ngày đó. Gói chỉ Completed khi các ngày chưa hủy đều Completed, hoặc Cancelled khi cả bảy ngày đã hủy.

Hai API cũ hủy/chuyển trạng thái toàn đơn trả 400 cho gói tuần; dùng các endpoint ngày bên trên.

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

Preview hủy trả `foodCredit`, `shippingCredit`, `creditedAmount`, `refundAmount`, `remainingPayable`, `refundStatus`, chính sách, cutoff và version để hiển thị trước nút xác nhận. `cancellation.refundAmount` là khoản yêu cầu hoàn; không đồng nghĩa `delivery.refundedAmount` hay `payment.refundedAmount` đã tăng.

Đổi/hủy lưu Order, điều chỉnh kho đã giữ/trừ, AuditLog và yêu cầu hoàn tiền trong cùng MongoDB transaction. `NotReserved` không được cộng trả hàng vì chưa từng giữ/trừ. `Held` điều chỉnh reservedStock; `Committed` điều chỉnh stock. Cần MongoDB replica set/Atlas để chạy transaction.

## Admin cấu hình bếp

`GET /admin/commerce-settings` và `PATCH /admin/commerce-settings` chỉ dành cho Admin. Body PATCH:

```json
{ "kitchenCutoffTime": "20:00", "kitchenCutoffDaysBefore": 1 }
```

`kitchenCutoffDaysBefore` nhận 0 (cùng ngày) hoặc 1 (ngày trước). Nếu chọn cùng ngày, giờ giao phải muộn hơn giờ chốt. Khi DB chưa có settings, GET/quote dùng mặc định, không tự ghi DB. PATCH tạo/cập nhật một document `_id: "commerce"` kèm audit. Chính sách hoàn MVP hiện cố định như trên; PATCH chỉ chỉnh giờ chốt. Đơn cũ không thay đổi cutoff/policy.

## Phần nối tiếp

- Đợt này triển khai backend; frontend cần màn hình lịch, đổi món, preview xác nhận hủy và cấu hình giờ chốt.
- Checkout đã có transaction, idempotency, giữ kho online 10 phút và trừ kho COD; xem [phần 6](checkout-inventory.md). Quote vẫn không giữ hàng.
- Chưa tích hợp IPN, thu COD, worker hết hạn thanh toán hay gọi cổng hoàn tiền. Refund Pending cần được xử lý trong phần thanh toán/đối soát, sau đó ghi tiền thực thu/hoàn và trạng thái tương ứng. Không đánh dấu đã hoàn chỉ vì khách hủy ngày.
- API sửa payment-status thủ công bị chặn cho cả gói tuần và đơn lẻ. Retry chỉ cho online Pending, chưa trả, còn hạn và chưa hủy ngày; giữ lại hàng nếu hold đã Released. Đơn đã hủy ngày cần đối soát lại số tiền. Phần IPN sắp tới phải xử lý cả callback đến muộn sau khi hủy và lấy số phải thu từ khoản thực tế sau giảm.
- Gói tuần cũ thiếu `cutoffAt`/`cancellationPolicy` không được tự đổi/hủy theo giả định mới; cần đối soát/migration có chủ đích. Đợt này không chạy migration hay sửa DB đang dùng.
- Test phần 5 dùng kho giả lập/HTTP cục bộ; phần 6 bổ sung MongoDB replica set thật tạm thời để kiểm tra checkout và đổi/hủy ngày cùng kho. Chưa kiểm thử cổng thanh toán.
