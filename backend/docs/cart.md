# Giỏ hàng — US-17

## Phân tích và phạm vi

Sau các bước schema/auth/phân quyền, backend đã có một giỏ/người, chế độ FOOD/COMBO và mã dòng riêng. Phần này hoàn thiện API giỏ hàng, kiểm tra dữ liệu, kiểm tra tồn kho và điểm nối với báo giá/checkout. Giữ nguyên Express, MongoDB và cấu trúc controller/service hiện có.

| Điểm cần hoàn thiện | Cách xử lý |
| --- | --- |
| Không biết giỏ nào đang được dùng khi cả hai phần response đều rỗng | Trả `currentCart`; vẫn giữ `foodCart`/`comboCart` cho frontend cũ |
| Đổi chế độ dễ làm mất hoặc trộn món | Chỉ đổi khi giỏ rỗng; đổi cùng chế độ không xóa món |
| Một món có thể ở nhiều ngày/bữa | Sửa/xóa bằng `_id` dòng, không dùng mã Food khi có nhiều dòng |
| Thêm tuần bằng nhiều request có thể thành công một phần | Bulk kiểm tra mọi dòng rồi ghi một lần vào document Cart |
| Tồn kho phải tính cho toàn giỏ | Cộng số phần của cùng món ở tất cả ngày/bữa; so với `stock - reservedStock` |
| Món bị hết hàng/ẩn/xóa sau khi thêm | Giữ dòng để khách thấy lỗi; trả `issues` và `canCheckout: false` |
| Hai thiết bị ghi đè giỏ | Mỗi lần ghi tăng version một lần; version cũ hoặc ghi đồng thời trả 409 |
| Client truyền mã thực đơn không thuộc mình | Kiểm tra chủ sở hữu, trạng thái và món/ngày/bữa trong MealPlan |

## Quy tắc

- DB giữ một Cart cho mỗi user bằng unique index `one_cart_per_user`; bước này không đổi index hay chạy migration.
- `FOOD` là mua lẻ, các dòng có ngày phải cùng một ngày. Có thể chưa chọn ngày; khi báo giá/checkout phải chọn ngày giao.
- `COMBO` là gói tuần, mỗi dòng bắt buộc có `deliveryDate` dạng `YYYY-MM-DD`. Bữa (`mealSlot`) có thể là Breakfast, Lunch, Dinner hoặc Snack.
- Ngày phải có thật và không ở quá khứ theo `Asia/Ho_Chi_Minh`. Các ngày của gói tuần nằm trong khoảng tối đa 7 ngày liên tiếp. Cho lưu giỏ chưa đủ tuần, nhưng chỉ cho checkout khi đủ cả 7 ngày.
- Cùng Food + ngày + bữa + nguồn MealPlan thì cộng số lượng. Khác một trong các trường này thì giữ dòng riêng. Một dòng có mã `_id` ổn định qua các lần đọc DB.
- Khi sửa ngày/bữa trùng dòng khác, gộp số lượng vào dòng đích. Frontend cần dùng lại response để lấy mã dòng mới nhất.
- Tối đa 100 dòng/giỏ và 100 dòng/request bulk. Số lượng phải là số nguyên dương, nằm trong giới hạn số nguyên an toàn; PATCH cho phép 0 để xóa.
- Cart dùng giá và dinh dưỡng hiện tại từ Food. Không nhận giá, userId hay tổng tiền do client quyết định.
- Cart chỉ kiểm tra số hàng có thể bán, chưa giữ/trừ kho. Việc giữ kho ACID thuộc bước checkout.

## API

Tất cả endpoint yêu cầu access token hợp lệ và role Customer. Admin/Manager bị chặn bởi middleware phân quyền đã có.

| Method | URL | Chức năng |
| --- | --- | --- |
| GET | `/cart` | Trả `result.currentCart`, kèm hai phần response tương thích cũ |
| GET | `/cart?cartType=FOOD` hoặc `/cart/food` | Trả phần FOOD; rỗng khi giỏ đang ở COMBO |
| GET | `/cart?cartType=COMBO` hoặc `/cart/combo` | Trả phần COMBO; rỗng khi giỏ đang ở FOOD |
| PATCH | `/cart/mode` | Đổi chế độ khi giỏ rỗng |
| POST | `/cart/items` | Thêm một dòng |
| POST | `/cart/items/bulk` | Thêm nhiều dòng bằng một lần ghi |
| PATCH | `/cart/items/:lineId` | Sửa số lượng/ngày/bữa |
| DELETE | `/cart/items/:lineId` | Xóa đúng một dòng |
| DELETE | `/cart` | Xóa món trong giỏ, giữ chế độ đang chọn |
| DELETE | `/cart/food` hoặc `/cart/combo` | Chỉ xóa khi giỏ đang ở chế độ tương ứng |
| POST | `/cart/refresh` | Lấy lại giá/tồn kho và lỗi hiện tại, không tự xóa dòng lỗi |

Các request ghi nhận `version` tùy chọn trong JSON body. Frontend mới nên luôn gửi version vừa đọc; nếu nhận 409 thì GET lại cart và cho người dùng thao tác lại. Không tự gửi lại lệnh thêm món, vì có thể cộng số lượng hai lần. Bỏ version vẫn tương thích client cũ nhưng không phát hiện được mọi thao tác dựa trên dữ liệu cũ của client; backend vẫn chặn hai lần ghi cùng version đọc từ DB.

### Đổi chế độ và thêm món

`PATCH /cart/mode`:

```json
{ "cartType": "COMBO", "version": 0 }
```

`POST /cart/items`:

```json
{
  "itemId": "<food_id>",
  "quantity": 2,
  "cartType": "COMBO",
  "deliveryDate": "2026-10-08",
  "mealSlot": "Lunch",
  "version": 1
}
```

Nếu không gửi cartType, dùng chế độ hiện tại; giỏ mới mặc định FOOD. Nếu chọn từ thực đơn đã lưu, gửi cả `mealPlanId` và `mealPlanItemId`; ngày/bữa/món phải khớp thực đơn Draft thuộc người đang đăng nhập. Thực đơn không lưu status được coi là Draft để tương thích dữ liệu hiện tại.

`POST /cart/items/bulk` dùng cartType/version chung ở ngoài, mỗi dòng có dữ liệu món riêng:

```json
{
  "cartType": "COMBO",
  "version": 2,
  "items": [
    { "itemId": "<food_id_1>", "quantity": 1, "deliveryDate": "2026-10-09", "mealSlot": "Lunch" },
    { "itemId": "<food_id_2>", "quantity": 1, "deliveryDate": "2026-10-10", "mealSlot": "Dinner" }
  ]
}
```

Ví dụ trên thêm hai ngày vào giỏ đang soạn. Nút “Đặt cả tuần” có thể gửi tất cả dòng của 7 ngày trong một request. Không tự lặp món lên 7 lần. Khi một dòng không hợp lệ, không có dòng nào trong request được thêm; giỏ trước đó được giữ nguyên (giỏ mới có thể đã được tạo rỗng).

### Sửa/xóa

`PATCH /cart/items/<cart_line_id>`:

```json
{ "quantity": 3, "deliveryDate": "2026-10-09", "mealSlot": "Dinner", "version": 3 }
```

Chỉ gửi trường cần sửa. `quantity: 0` xóa dòng. `deliveryDate: null` bỏ ngày ở FOOD; COMBO không được bỏ ngày. `mealSlot: null` bỏ bữa. Dòng tham chiếu MealPlan vẫn phải khớp ngày/bữa trong thực đơn; muốn chọn độc lập thì xóa dòng và thêm lại không kèm nguồn thực đơn.

`DELETE /cart/items/<cart_line_id>` hoặc `DELETE /cart` có thể gửi body `{ "version": 4 }`.

Mã Food cũ trên URL chỉ được chấp nhận khi giỏ có đúng một dòng của món đó; nếu có nhiều dòng thì trả 400. Không thể sửa/xóa dòng của người khác.

### Response dùng cho giao diện

GET /cart trả `{ message, result: { currentCart, foodCart, comboCart } }`. Các API thêm/sửa/đổi chế độ trả `{ message, result: <cart summary> }`.

- `items[]._id`: mã dòng dùng để sửa/xóa; `itemId`: mã Food.
- `items[].deliveryDate`, `mealSlot`, `quantity`, `unitPrice`, `lineTotal`: dữ liệu hiển thị từng dòng.
- `items[].availability`: `isActive`, `inStock`, `availableQuantity`. Số hàng khả dụng là tổng cho món, không phải riêng một ngày.
- `summary.itemCount`: tổng số phần cho badge. `lineCount`: số dòng. `subtotal`, `totalCalories`: cộng các dòng thực tế. `deliveryDates`: các ngày đã chọn.
- `canCheckout`: giỏ hợp lệ tại thời điểm đọc; không phải cam kết đã giữ hàng hay đã đủ thông tin thanh toán.
- `issues[]`: `{ code, message, lineId? }`. Các mã: EMPTY_CART, MISSING_DATE, PAST_DATE, MULTIPLE_DATES, WEEK_TOO_LONG, INCOMPLETE_WEEK, FOOD_REMOVED, FOOD_INACTIVE, OUT_OF_STOCK, INSUFFICIENT_STOCK.
- `summary.shippingFee: null` khi chưa có địa chỉ. `shippingPolicy` là FIRST_DAY_ONLY cho tuần hoặc PER_ORDER cho lẻ. Dùng `/orders/quote` hiện có sau khi có địa chỉ/ngày giao để lấy phí cụ thể; gói tuần chỉ thu ngày đầu, các ngày sau có số phí được miễn.
- `version`: phiên bản cần gửi cho lần sửa tiếp theo.

Frontend hiện tại vẫn dùng foodCart. Khi tích hợp giao diện giỏ tuần, chuyển sang currentCart, gửi mã dòng và version; hiển thị issues và chặn nút checkout khi canCheckout=false. Backend quote/create cũng tự kiểm tra lại cart, không chỉ dựa vào nút phía frontend.

## Kiểm chứng và phần tiếp theo

`npm test` chạy thêm `tests/cart.test.ts`: lưu giỏ, gộp/tách dòng, xung đột, bulk thất bại, tồn kho cộng dồn, món bị ẩn/xóa, lịch giao, quyền sở hữu thực đơn, validation và HTTP routes. Có kiểm thử báo giá tuần với 7 ngày/số lượng khác nhau và phí ship một lần.

Test giỏ dùng collection giả và bản sao BSON. [Phần 6 — Checkout và tồn kho](checkout-inventory.md) đã bổ sung transaction, giữ kho, key chống tạo đơn trùng và xóa giỏ theo version; có integration test trên MongoDB replica set tạm. IPN, tự hủy đơn 15 phút và hoàn tiền thuộc phần thanh toán tiếp theo.
