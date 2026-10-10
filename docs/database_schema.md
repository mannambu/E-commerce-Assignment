# Database FitBite — 12 collection cho MVP

Nguồn yêu cầu: [func_request.md](func_request.md). Backend dùng MongoDB native driver. Các file trong `backend/src/models/schemas` khai báo kiểu TypeScript, không phải MongoDB validator.

## Phần đã thay đổi

Giảm từ 17 schema xuống 12. Gộp ba loại log sức khỏe vào nhật ký theo ngày; nhúng phần giữ kho vào đơn; bỏ cache Analytics và job ReportExport khỏi MVP dữ liệu nhỏ. Đổi RefreshToken thành Session, CommerceSettings thành Settings.

Service tracking, giỏ hàng, đơn, đánh giá, dashboard nhật ký và seed đã được cập nhật để đọc/ghi cấu trúc mới. Các schema thuần dữ liệu dùng interface; User, Food, Cart, Session giữ constructor/hàm mặc định đang được sử dụng.

Đây là đợt đơn giản hóa dữ liệu và cập nhật các chỗ sử dụng. **Chưa phải hoàn thành tất cả user story.** Xem mục nghiệp vụ còn thiếu ở cuối tài liệu.

## Giải thích từng collection

| Collection | Nội dung | Lý do giữ riêng |
| --- | --- | --- |
| `users` | Email, mật khẩu đã hash, Customer/Admin/Manager, khóa tài khoản, hồ sơ sức khỏe hiện tại | Tài khoản là dữ liệu gốc. Không còn các mảng notifications/weightTracking/calorieTracking cũ. |
| `sessions` | Hash của refresh token, người dùng, hạn phiên, sessionId, thời điểm thu hồi | Một người có nhiều phiên; access token được kiểm tra với phiên và tokenVersion trên mỗi request. |
| `foods` | Tên, mô tả, ảnh, giá, dinh dưỡng, nguyên liệu/dị ứng, tồn kho, nhãn | Dữ liệu món hiện đang bán. Nguyên liệu và dinh dưỡng nằm trong món. |
| `carts` | Một giỏ/người, chế độ FOOD/COMBO, dòng món theo ngày và bữa | Giỏ chưa phải đơn; giá hiện tại lấy từ Food, không lưu priceAtOrder. Không lưu lịch sử giỏ. |
| `meal_plans` | Thực đơn 1/7 ngày, các bữa, hồ sơ sức khỏe đã dùng để gợi ý | Khách có thể dùng thực đơn mà chưa mua hàng. |
| `orders` | Một/bảy kỳ giao, món trong từng kỳ, snapshot giá/dinh dưỡng, thanh toán, giữ kho | Là bản chốt việc mua hàng. Không đọc lại giá Food để tính tiền đơn cũ. |
| `daily_health_logs` | Một người/ngày: cân nặng, món đã ăn, target ngày, mọi lần đổi hồ sơ | Thay HealthProfileHistory, WeightLog và CalorieLog bằng một nhật ký dễ truy vấn theo ngày. |
| `reviews` | reviewerId, foodId, orderId, sao, nhận xét, ảnh, thông tin ẩn | Đọc theo món và kiểm tra mua hàng. Một review/đơn theo US-26. |
| `notifications` | Người nhận, khẩn/thường/tin tức, nội dung, readAt, eventKey | Thông báo tăng theo thời gian, cần phân trang và đồng bộ riêng. |
| `transactions` | Các khoản Payment/Refund/Expense, số tiền, mã cổng, đối soát | Nguồn cho báo cáo tài chính. Một đơn có thể có nhiều lần thu/hoàn. |
| `audit_logs` | Ai làm gì, đối tượng nào, lúc nào, lý do và dữ liệu thay đổi | Kiểm tra thao tác quản trị. Không chứa mật khẩu, token hoặc bí mật cổng thanh toán. |
| `settings` | Một document `_id = commerce`: giờ chốt bếp, chính sách hủy/hoàn, người sửa | Admin thay đổi cấu hình từ giao diện. Quy tắc cố định để trong code. |

`common.ts` chỉ chứa kiểu và hằng số dùng chung, không phải collection thứ 13.

## Nhật ký sức khỏe

```text
daily_health_logs
  userId + date                 Duy nhất cho mỗi người/ngày
  weightKg, weightRecordedAt    Điểm cân mới nhất của ngày, có thể chưa có
  targetSnapshot               Target và macro của ngày đó
  meals[]                      Món thực tế đã ăn
    consumptionKey             Định danh cùng một suất ăn
    sourceType/sourceId        Order, MealPlan hoặc Manual
    foodName, quantity, mealSlot
    caloriesConsumed, nutritionConsumed
    consumedAt
  profileChanges[]             Giữ mọi lần thay đổi, không chỉ lần cuối
    changedAt, reason
    profileSnapshot            Đầu vào và kết quả BMR/TDEE/target lúc thay đổi
```

- Ngày là chuỗi YYYY-MM-DD theo Asia/Ho_Chi_Minh; thời điểm cụ thể lưu BSON Date.
- Chỉ ghi đè cân nặng của đúng ngày đang sửa. Sửa cân ngày cũ không thay cân hiện tại nếu đã có điểm mới hơn.
- Lưu hồ sơ hiện tại và thêm lịch sử trong cùng MongoDB transaction.
- Thêm món bằng một update có điều kiện `meals.consumptionKey != key`. Index unique user/ngày không tự chống trùng các phần tử trong mảng.
- Một suất từ MealPlan dùng cùng consumptionKey khi được đặt hàng và ghi nhận ăn. Nhiều lần gọi Completed không cộng lại suất đó.
- Macro không biết của món nhập tay để trống; không tự coi là 0.
- Tổng calo ngày tính từ meals; không lưu thêm một tổng phải cập nhật song song.
- Thực đơn MealPlan cũng tính tổng calo/macro từ meals khi trả API, tránh phải đồng bộ thêm trường tổng sau mỗi lần swap.

## Giỏ hàng và đơn

```text
orders
  userId, orderCode, packageType
  deliveries[]
    date, scheduledAt, cutoffAt
    status, statusHistory[]
    items[]
      foodId, foodName, image
      quantity, price, calories, nutrition
      mealSlot, mealPlanId, mealPlanItemId
    subtotal, shipping, waivedShippingFee, refundedAmount
    cancellation
  subtotal, shippingFee, grandTotal
  payment
  inventoryHold
    status, items[{foodId, quantity}], expiresAt
  paymentDueAt
  statusHistory[]
  cancellationPolicy
  targetCaloriesSnapshot
```

Order không còn các mảng lưu song song `items`, `deliverySchedule`, `shippingBreakdowns`. Các thông tin đó nằm trong từng delivery. Một ngày có một delivery, gói tuần có bảy delivery; mỗi delivery giữ món của chính ngày đó.

- Cart giữ `cartType: FOOD | COMBO` để biểu diễn chế độ mua, Food không có isCombo. Đổi chế độ khi giỏ còn món trả lỗi để khách chủ động xử lý giỏ.
- Dòng giỏ có _id riêng. Cùng món ở ngày/bữa khác nhau là các dòng khác nhau.
- Gói tuần phải có món cho đủ bảy ngày tương ứng với deliveryDate checkout. Backend không nhân một giỏ lên bảy lần.
- Tổng tiền bằng tổng các món đã chọn. Ship chỉ tính ngày đầu; những ngày sau ghi phần được miễn.
- Dinh dưỡng và giá trong Food/OrderItem tính trên một suất; lượng đã ăn là tổng theo quantity.
- `inventoryHold` thuộc về đơn nên nhúng trong đơn. Stock tổng vẫn thuộc Food: khả dụng = stock - reservedStock.
- Giữ, chốt hoặc nhả kho phải cập nhật cả Order và Food trong cùng transaction. Không dùng TTL xóa đơn để nhả kho.
- Hạn giữ 10 phút và hạn thanh toán 15 phút nằm trong common.ts. Chỉ ghi Held khi đã thực sự giữ kho.
- Gói tuần lưu `cutoffAt` từng ngày và `cancellationPolicy` lúc đặt; Admin đổi settings chỉ áp dụng cho đơn mới. `targetCaloriesSnapshot` giữ mục tiêu calo tại lúc đặt để kiểm tra đổi món.
- `deliveries[].cancellation` lưu `creditedAmount` (giá trị được giảm), `refundAmount` (khoản yêu cầu hoàn) và `refundTransactionId`. Hoàn tiền thực tế được ghi riêng ở `refundedAmount`; yêu cầu hoàn Pending không phải đã hoàn.
- Tổng giá gốc của đơn được giữ nguyên khi hủy ngày; API bổ sung `amounts` để đọc giá trị sau giảm, đã thu, đã hoàn, chờ hoàn và còn phải trả. Không dùng giá gốc để thu lại đơn đã hủy một phần.
- Xem [gói tuần và phí giao hàng](../backend/docs/weekly-orders.md) cho chính sách MVP, API đổi/hủy ngày, cấu hình giờ chốt và các phần checkout/thanh toán còn phải nối tiếp.

## Các phần đã bỏ hoặc làm gọn

| Trước đây | Hiện tại |
| --- | --- |
| HealthProfileHistory + WeightLog + CalorieLog | DailyHealthLog |
| InventoryReservation riêng | Order.inventoryHold |
| Analytics | Tính báo cáo từ dữ liệu gốc khi cần; có thể thêm cache khi dữ liệu lớn |
| ReportExport | Chỉ bổ sung khi cần job xuất file lớn theo US-29; xuất file vẫn chưa được triển khai |
| Review.targetType/targetId | Review.foodId và orderId |
| User.notifications/weightTracking/calorieTracking | Collection chuyên trách tương ứng |
| Food.description + details | description |
| Food.isCombo | Chế độ mua của Cart/Order |
| Cart.priceAtOrder và trạng thái lịch sử giỏ | Giá hiện tại từ Food, một giỏ/người |
| CommerceSettings chứa cả hằng số cố định | Settings chỉ giữ các giá trị Admin thay đổi |

## API bị ảnh hưởng

- Tạo/xem đơn trả `deliveries[].items[]`; frontend cần đọc cấu trúc này. Đây là thay đổi response Order.
- `GET /cart` trả `currentCart` là giỏ đang dùng; vẫn giữ foodCart/comboCart để giảm thay đổi giao diện. Chỉ một phần có món, DB không tạo hai giỏ.
- `POST /cart/items` nhận thêm cartType, deliveryDate, mealSlot, mealPlanId, mealPlanItemId. Với COMBO, deliveryDate bắt buộc.
- PATCH/DELETE `/cart/items/:lineId` dùng `_id` dòng. foodId cũ chỉ được chấp nhận nếu xác định đúng một dòng; nhiều ngày/bữa trả lỗi rõ ràng.
- Cart hỗ trợ đổi chế độ khi rỗng, thêm nhiều dòng trong một lần, sửa ngày/bữa và kiểm tra version để tránh ghi đè từ thiết bị khác. Xem [quy tắc và API cart](../backend/docs/cart.md).
- Tạo review nhận foodId và orderId. Body targetId/targetType=Food vẫn được nhận ở controller để tương thích; DB chỉ ghi foodId. Nên gửi orderId để chọn đúng lần mua.
- Tracking trả ngày YYYY-MM-DD; lịch sử calo có target của từng ngày, entries là các món đã ăn.
- Food không lưu details/isCombo; request cập nhật chỉ nhận các trường thuộc schema.

## Chuẩn bị database

Không tự chuyển hoặc xóa dữ liệu DB đang dùng. Thiết kế mới yêu cầu DB mới hoặc migration đã chuẩn bị. Backend startup chỉ kết nối, không sửa/xóa index của DB cũ.

1. Chọn database rỗng cho bản làm lại. MongoDB cần replica set/Atlas để cập nhật hồ sơ và nhật ký bằng transaction.
2. Thiết lập tên collection nhất quán trong script và server; mặc định là 12 tên ở bảng trên.
3. Xem kế hoạch, không kết nối DB:

   ```sh
   npm run schema:indexes
   ```

4. Khi chủ động khởi tạo DB rỗng, cấu hình `DB_URI` và `DB_NAME` trong `backend/.env` rồi chạy từ thư mục `backend`:

   ```sh
   npm run schema:indexes -- --apply
   ```

   Script chỉ chấp nhận DB rỗng, không phải công cụ migration. Collection settings được tạo khi lưu cấu hình lần đầu.

5. Backend, seed và script tạo index dùng chung `DB_URI` + `DB_NAME`, không cần biến kết nối riêng cho schema. Xem [hướng dẫn xác thực](../backend/docs/auth-setup.md).
6. Seed dữ liệu mẫu sau khi đã tạo index.

Biến mới: DB_SESSIONS_COLLECTION, DB_DAILY_HEALTH_LOGS_COLLECTION, DB_SETTINGS_COLLECTION. Các biến DB_REFRESH_TOKENS_COLLECTION, DB_CALORIE_LOGS_COLLECTION, DB_ANALYTICS_COLLECTION không còn được backend sử dụng.

Nếu cần giữ dữ liệu cũ, phải chuyển trên bản sao trước: hợp nhất giỏ theo người dùng; nhóm món Order theo ngày giao; gộp log theo user/ngày và tránh cộng trùng nguồn cũ; chuyển lịch sử hồ sơ từng lần; chuyển review sang foodId/orderId (xử lý review cũ không xác định được đơn); chuyển phiên hoặc yêu cầu đăng nhập lại. Sau khi kiểm tra mới tạo unique index và chuyển ứng dụng. Không chạy trực tiếp code mới với dữ liệu Order/Cart/Tracking cũ.

## Nghiệp vụ còn thiếu

- Xác thực đã có Bcrypt, sessionId/tokenVersion, thu hồi phiên và reset bằng mã email 6 chữ số. `users.forgot_password_token` lưu Bcrypt hash của mã, `forgot_password_expires_at` lưu hạn 15 phút, `forgot_password_attempts` giới hạn 5 lần thử và `forgot_password_requested_at` giới hạn gửi lại sau 60 giây. Cần cấu hình SMTP và nối giao diện frontend; có thể test độc lập bằng Postman, xem [auth-setup.md](../backend/docs/auth-setup.md).
- Checkout hiện lưu cấu trúc mới và kiểm tra giỏ nhưng chưa thực hiện giữ/trừ kho ACID, idempotency đầy đủ, IPN hay job hết hạn. inventoryHold hiện khởi tạo NotReserved. COD/Confirmed, đối soát, hủy/hoàn từng ngày cần hoàn thiện.
- Công thức tính target hiện được đưa vào utils/health.ts để dùng chung; quy tắc điều chỉnh theo phần trăm và sàn BMR của US-08 chưa được thay trong đợt schema.
- MealPlan đã có cấu trúc lưu; API recommendation hiện chưa lưu thực đơn/swap vào collection.
- Manager đã có quyền đọc đơn; AuditLog đã ghi việc tạo và khóa/mở user. Báo cáo Manager, sổ Transaction, audit nghiệp vụ khác, API Settings, WebSocket, ẩn review kèm thông báo và Excel còn cần triển khai. Dashboard tài chính Admin cũ chưa tách khỏi vận hành và chưa đọc sổ Transaction.
- Test hiện dùng mock, không chứng minh transaction hoặc index trên một MongoDB thật.
