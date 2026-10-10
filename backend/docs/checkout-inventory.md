# Phần 6 — Checkout và tồn kho

Thực hiện US-18 trên cấu trúc hiện có: một Cart/người dùng, một Order chứa các ngày giao,
`inventoryHold` nhúng trong Order. Không thêm collection giữ kho hoặc một luồng checkout riêng cho gói tuần.

## Quy tắc tồn kho

| Trường | Ý nghĩa |
| --- | --- |
| `Food.stock` | Số phần chưa bán, bao gồm phần đang giữ tạm |
| `Food.reservedStock` | Số phần đang giữ cho các đơn online |
| `stock - reservedStock` | Số phần còn có thể đặt |
| `Order.inventoryHold.items` | Tổng số phần mỗi món của đơn, cộng tất cả ngày/bữa còn hiệu lực |

- Online: `Pending`, `payment.status = Pending`, tăng `reservedStock`, giữ 10 phút. Chưa trừ `stock`.
- COD: `Confirmed`, `payment.status = Pending`, trừ `stock` ngay; `inventoryHold.status = Committed`.
  Chưa đánh dấu đã thu tiền. Không có hạn giữ kho/hạn thanh toán online.
- IPN sau này: chỉ khi đã verify mới gọi `inventory.commitHold()` để giảm cả `stock` và `reservedStock`.
- Hết hạn giữ: giảm `reservedStock` đúng một lần, chuyển hold sang `Released`; không cộng thêm `stock`.
- Hủy COD trước chế biến: trả lại số phần đã trừ. Hủy sau khi đã chế biến không tự cộng hàng đã dùng lại vào kho.
- Admin không thể hạ `stock` xuống dưới `reservedStock`.

Ví dụ: stock = 10, reservedStock = 0. Online giữ 3 phần → 10/3, còn bán 7.
Thanh toán thành công → 7/0. Nếu hết hạn giữ → 10/0.

## API đặt đơn

`POST /orders/quote` giữ nguyên contract. Báo giá kiểm tra giỏ và các ngày giao nhưng **không giữ kho**.
Lấy `result.cart.version` cho lần xác nhận đặt hàng.

`POST /orders` cần thêm hai trường bắt buộc:

```json
{
  "deliveryAddress": "123 đường ABC, TP.HCM",
  "deliveryDate": "2026-11-01",
  "deliveryTime": "12:00",
  "packageType": "ONE_DAY",
  "cartType": "FOOD",
  "paymentMethod": "VNPay",
  "cartVersion": 3,
  "idempotencyKey": "checkout-550e8400-e29b-41d4-a716-446655440000"
}
```

Giữ nguyên cách dùng `distanceKm`/biểu phí đã thống nhất ở phần 5. Không truyền distanceKm thì backend
gọi geocoding/OSRM **trước** transaction. Kết quả phí được dùng nguyên vẹn khi ghi đơn để tránh sai biểu phí
ở khoảng cách sát ranh giới do làm tròn. Gói tuần vẫn dùng món của từng ngày và chỉ thu ship ngày đầu.

- `idempotencyKey`: 8–128 ký tự chữ/số/`_`/`-`; một key cho một lần đặt, giữ nguyên khi thử lại sau lỗi mạng.
- `cartVersion`: phiên bản giỏ đã xác nhận; giỏ bị sửa ở tab/thiết bị khác trả 409 để khách xem lại.
- Lần tạo mới: HTTP 201, `result.replayed = false`.
- Cùng người dùng + cùng key + cùng nội dung: HTTP 200 và đúng đơn đã tạo, `replayed = true`.
  Không đọc/xóa giỏ mới và không giữ kho thêm lần nữa.
- Cùng key nhưng thay địa chỉ, phiên bản giỏ, phương thức thanh toán…: HTTP 409.
- Cùng key của hai người dùng khác nhau không xung đột.
- Thiếu key/version hoặc sai định dạng: HTTP 422 ở validation.
- Giỏ có món ẩn/xóa/thiếu hàng: trả `issues[]` theo dòng; gói tuần vẫn trả các lựa chọn thay thế như phần 5.

Giá trong giỏ/báo giá là tạm tính. Checkout đọc lại giá, dinh dưỡng và trạng thái bán trong transaction;
Order lưu snapshot cuối cùng. Không lấy giá/tổng tiền do client tự gửi. Sau khi đơn được tạo,
thay đổi giá món không sửa đơn cũ.

## Một transaction làm những gì?

1. Tìm đơn theo key để xử lý gửi lặp.
2. Đọc lại giỏ, món và cấu hình lịch giao bằng cùng session; kiểm tra phiên bản giỏ và toàn bộ lịch.
3. Giữ/trừ kho bằng update có điều kiện `stock - reservedStock >= số phần cần`.
4. Ghi Order cùng snapshot, lịch giao và lịch sử trạng thái.
5. Kiểm tra các dòng có nguồn MealPlan còn khớp Draft của người dùng, đánh dấu plan `Ordered` và lưu `orderId`.
6. Xóa nội dung giỏ bằng điều kiện phiên bản; tăng version. Không xóa document Cart.

Một bước lỗi thì MongoDB hoàn tác tất cả. Driver thử lại transaction khi có tranh chấp ghi;
lần thử lại đọc dữ liệu mới nên không bán vượt tồn kho hay ghi đè giỏ vừa sửa.
Một MealPlan đã được dùng trong checkout được khóa theo cấu trúc `orderId` hiện có, kể cả khi chỉ chọn một phần plan.
Đặt thêm phần còn lại cần tạo giỏ độc lập hoặc thực đơn mới; không gắn hai Order vào cùng plan.

`inventory.services.ts` chỉ điều chỉnh kho và dữ liệu hold trong bộ nhớ; caller phải lưu Order trong cùng session.
Giỏ hàng vẫn chịu trách nhiệm kiểm tra/gộp dòng trước checkout. Báo giá không gọi giữ kho.

## Hết hạn và thanh toán lại

Backend khởi động một job quét ngay khi kết nối DB thành công, sau đó mỗi 15 giây, tối đa 100 đơn/lượt.
Job chỉ xử lý online Pending chưa thu tiền có hold Held đã hết hạn. Mỗi đơn có transaction riêng và ghi AuditLog.
Nhiều instance cùng quét vẫn chỉ nhả một lần. Một đơn lỗi được ghi log để kiểm tra, không chặn các đơn khác trong lượt.
Việc nhả vật lý có thể trễ tối đa một chu kỳ quét trong điều kiện tải bình thường.

Để hiển thị đếm ngược, dùng `inventoryHold.expiresAt`; không dùng `paymentDueAt` thay thế:

- `expiresAt`: hạn giữ hàng 10 phút.
- `paymentDueAt`: hạn thanh toán online 15 phút, được giữ nguyên suốt đời đơn.
- Hết 10 phút: Order vẫn Pending nhưng hold Released, chờ giữ lại hàng/thanh toán lại.

`POST /orders/:orderId/payments/retry` kiểm tra chủ đơn, Pending, chưa trả tiền, còn hạn và chưa chốt lịch giao.
Nếu kho đã được nhả, service thử giữ lại toàn bộ món còn hiệu lực theo snapshot của đơn.
Thiếu hàng thì từ chối, không trừ kho âm. Hold mới hết hạn không muộn hơn `paymentDueAt`.
Gọi retry liên tiếp không kéo dài hold còn hiệu lực; không đổi COD sang online hoặc ngược lại.
Gói đã hủy ngày tiếp tục bị chặn retry để phần thanh toán đối soát số tiền đã giảm.

## Các điểm giao nhau đã xử lý

| Phần trước | Cách nối với checkout |
| --- | --- |
| Cart version | Xóa giỏ trong transaction theo đúng version; gửi lại key cũ không ảnh hưởng giỏ mới |
| Món trong nhiều ngày | Cộng tổng nhu cầu của cùng Food một lần, không nhân cả giỏ với 7 |
| Đổi/hủy ngày của gói tuần | Dùng chung `inventory.changeItems()` với checkout, không có thuật toán kho thứ hai |
| Hủy đơn lẻ | Cập nhật Order, nhả/trả kho và audit trong cùng transaction |
| Timeline COD | Pending → Confirmed ở lúc đặt; thanh toán vẫn Pending cho tới thu COD |
| Chế biến đơn lẻ/ngày của gói tuần | Chỉ Confirmed → Cooking, kho phải Committed; online phải có giao dịch VerifiedIPN thành công |
| Sửa payment thủ công | Endpoint cũ trả 400 cho cả đơn lẻ và tuần để không tách tiền khỏi kho |
| Admin sửa kho | Update có điều kiện, không thể ghi tồn kho thấp hơn lượng giữ |
| Form checkout hiện có | Gửi key/version, giữ key khi thử lại; dùng tổng từ backend, bỏ giảm giá 15.000đ tự tính; giao 12:00 giờ Việt Nam |
| Danh sách đơn khách/Admin | Nhận biết Confirmed; Admin chuyển từ Confirmed sang Cooking thay vì bỏ qua xác nhận |

## Phạm vi dành cho phần thanh toán tiếp theo

- Chưa tích hợp VNPay/MoMo, thu COD, gọi hoàn tiền hoặc job tự **hủy đơn** ở phút 15 (US-19/20).
  Job ở phần này chỉ **nhả kho**. Sau phút 15, retry bị từ chối nhưng trạng thái đơn chưa tự đổi Cancelled.
- IPN phải verify chữ ký/số tiền/mã đơn, chống ghi lặp rồi gọi `commitHold()` và ghi Payment + Order
  trong **cùng** `database.withTransaction()`. Không mở route công khai gọi trực tiếp `commitHold()`.
- Callback đến khi hold đã hết phải kiểm tra/giữ lại hàng. Nếu không còn hàng hoặc quá hạn thanh toán,
  cần luồng hoàn tiền/đối soát; không được đánh dấu Confirmed chỉ vì cổng đã nhận tiền.
- Hủy đơn lẻ đã thu tiền bị chặn để chờ luồng hoàn tiền. Gói tuần tiếp tục ghi Refund Pending như phần 5.
- Không tự backfill kho cho đơn cũ `NotReserved`: không biết đơn đó đã trừ kho hay chưa.

## Chạy và kiểm thử

Cần MongoDB replica set hoặc Atlas. Bộ index hiện có đã có `checkout_once`, `one_cart_per_user`,
`release_stock`; chuẩn bị bằng script `schema:indexes` theo quy trình DB của dự án. Startup không tự tạo index,
không migration và không chuyển sang ghi rời rạc nếu transaction không được hỗ trợ.

```bash
npm test
npm run test:checkout:integration
npm run build
```

Integration test tự chạy MongoDB replica set tạm bằng `mongodb-memory-server`, tạo index thật,
đóng/xóa DB tạm khi xong. Lần đầu có thể cần tải MongoDB binary. Không kết nối DB được cấu hình trong `.env`.
Các ca kiểm thử gồm tranh hàng cuối, key gửi lặp đồng thời, hai key dùng một giỏ, đổi giá sau báo giá,
giỏ bị sửa, rollback giữa chừng, COD, job nhả trùng, retry giữ lại hàng, đổi/hủy ngày, commit kho tranh chấp
với job, ràng buộc tồn kho Admin, nguồn MealPlan và HTTP validation/phân quyền.
