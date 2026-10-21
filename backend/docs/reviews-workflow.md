# Đánh giá món ăn — FR-REV-001–005

Chỉ thay đổi backend. Khóa đánh giá là **đơn + ngày giao + món** theo `func_request_ver2.0.md`.

## Quy tắc dễ kiểm tra

| Trường hợp | Kết quả |
| --- | --- |
| Customer đánh giá món trong ngày `Completed` thuộc đơn của mình | Cho phép; không đợi toàn gói tuần hoàn tất |
| Món không thuộc ngày được chọn, ngày chưa `Completed`, hoặc đơn người khác | 403, không lưu |
| Hai món khác nhau trong cùng ngày | Mỗi món được một đánh giá |
| Cùng món ở hai ngày đã giao | Mỗi ngày được một đánh giá |
| Cùng món lặp ở nhiều bữa hoặc số lượng > 1 trong một ngày | Vẫn chỉ một đánh giá |
| Gửi trùng hoặc tạo lại đánh giá đã bị ẩn | 409 |
| Tác giả sửa sao/chữ/ảnh trong 7 × 24 giờ từ lúc tạo | Cho phép; không đổi đơn/ngày/món/tác giả |
| Đủ 7 ngày hoặc thiếu thời điểm tạo hợp lệ | 409 khi sửa |
| Admin ẩn có lý do | Lưu người ẩn, thời điểm, lý do, audit và thông báo tác giả |
| Customer, Manager, Kitchen, Delivery yêu cầu ẩn | 403 |
| Tác giả sửa đánh giá đã bị ẩn trong hạn | Vẫn giữ trạng thái ẩn |

Món đã ngừng bán vẫn có thể được đánh giá nếu từng được giao hợp lệ. Quyền đánh giá không phụ thuộc phương thức thanh toán; bước này không tích hợp cổng thanh toán.

## API

### Customer tạo đánh giá

`POST /reviews`, JWT Customer:

```json
{
  "orderId": "<order._id>",
  "deliveryId": "<order.deliveries[i]._id>",
  "foodId": "<food._id>",
  "rating": 5,
  "comment": "Món ngon",
  "images": ["https://res.cloudinary.com/.../meal.jpg"]
}
```

`orderId`, `deliveryId`, `foodId` bắt buộc. `deliveryId` là ID của ngày giao, không phải chuỗi ngày hoặc ID dòng món. Body cũ `targetType: "Food"` + `targetId` được dùng thay `foodId`, nhưng vẫn phải có `orderId` và `deliveryId`. Nếu truyền cả `foodId` và `targetId`, hai ID phải trỏ cùng món.

Sao là số nguyên 1–5; nhận xét sau trim dài 1–5000 ký tự; ảnh tùy chọn, tối đa 10 URL HTTPS. Có thể dùng URL trả về từ API upload Cloudinary hiện có. Không gửi API key trong body.

Thành công: 201 với `{ message, result }`. Sai cấu trúc qua validator: 422; nội dung không hợp lệ tại service: 400; không đủ điều kiện: 403; trùng: 409.

### Customer sửa đánh giá

`PATCH /reviews/:review_id`, body có ít nhất một trong `rating`, `comment`, `images`. Chỉ tác giả được sửa trong hạn. Field khác bị từ chối 400. Không tự mở lại đánh giá bị ẩn.

### Danh sách công khai

`GET /reviews/Food/:foodId?rating=5&hasImages=true&page=1&limit=20`

Các query tùy chọn: `rating` 1–5; `hasImages` đúng chuỗi `true`/`false`; `page` mặc định 1; `limit` mặc định 20, tối đa 100. Sắp xếp mới nhất trước. Response vẫn `{ message, result: [...] }`. Chỉ trả đánh giá hiển thị; không trả lý do/người/thời điểm ẩn.

`Food.rating` và `Food.reviewCount` chỉ tính đánh giá hiển thị; rating làm tròn một chữ số thập phân. Không có đánh giá hiển thị thì cả hai bằng 0. Tạo/sửa/ẩn cập nhật điểm trong cùng transaction, kể cả khi nhiều người thao tác đồng thời.

### Admin ẩn đánh giá

`PATCH /reviews/:review_id/hide`, JWT Admin:

```json
{ "reason": "Nội dung vi phạm quy định đánh giá" }
```

Lý do sau trim dài 1–500 ký tự. Thành công trả `{ message, changed: true }`. Gọi lại trả `changed: false`, giữ lý do ban đầu, không tạo thêm audit/thông báo. `DELETE /reviews/:review_id` được giữ làm alias với **cùng body lý do và cùng hành vi ẩn**, không xóa bản ghi. Owner không có quyền DELETE.

Ẩn, tính điểm, audit và bản ghi chờ email được commit cùng nhau; lỗi ghi bất kỳ bước nào đều rollback. Worker gửi email lý do cho tác giả sau commit; lỗi SMTP không hoàn tác việc ẩn. Theo quyết định 21/10/2026 chỉ dùng [email](email-notifications.md), không làm WebSocket.

## Chuyển dữ liệu/index cũ

Index mới: unique `{ orderId: 1, deliveryId: 1, foodId: 1 }`, gồm cả đánh giá ẩn. Index cũ unique `orderId` sẽ chặn đánh giá món/ngày thứ hai nếu chưa chuyển.

**Chưa chạy migration trên database dự án.** Công cụ dưới đây đã được kiểm thử bằng MongoDB tạm:

1. Sao lưu và thử trên bản sao trước. Kiểm tra `.env` đang trỏ đúng database.
2. Tại thư mục `backend`, chạy preview chỉ đọc:

   ```powershell
   npm run reviews:migrate
   ```

3. Review cũ thiếu `deliveryId` chỉ được tự xác định khi có đúng một ngày `Completed` chứa món trong đơn đúng chủ sở hữu. Nếu có nhiều ngày phù hợp, đối chiếu bằng chứng rồi lập file JSON:

   ```json
   { "<reviewId>": "<deliveryId đã xác minh>" }
   ```

   ```powershell
   npm run reviews:migrate -- --mapping=review-days.json
   ```

4. Giải quyết toàn bộ `issues` trước khi áp dụng. Script không tự xóa/gộp review trùng, không tự chọn một ngày trong nhiều ngày, không tự sửa dữ liệu nguồn thiếu hoặc sai.
5. Dừng **mọi backend/job có thể ghi dữ liệu** trong suốt quá trình chuyển. Sau khi kiểm tra bản sao và bản sao lưu, chạy:

   ```powershell
   npm run reviews:migrate -- --mapping=review-days.json --apply --offline
   ```

   Bỏ `--mapping` nếu không cần. `--offline` là xác nhận của người vận hành rằng writer đã dừng, không tự dừng server.
6. Script bổ sung ngày giao và tính lại điểm trong transaction; tạo unique index mới thành công rồi mới bỏ index `orderId` cũ. Nếu bị gián đoạn, giữ writer dừng, chạy preview và chạy lại; không mở ứng dụng trước khi index đúng. Kiểm tra món/ngày thứ hai tạo được review, bản trùng bị 409 rồi mới mở backend mới.

Database phải hỗ trợ transaction (replica set/Atlas). `schema:indexes --apply` chỉ dành cho database rỗng, không thay thế migration. Dữ liệu quá lớn cho một transaction cần kế hoạch chuyển riêng; script không tự chia lô hoặc bỏ qua bản ghi lỗi.

## Kiểm thử

```powershell
npm test
npm run test:reviews:integration
npm run test:shipper:integration
npm run build
npm run lint
```

Bộ integration reviews dùng MongoDB tạm, gồm quyền theo ngày, chống trùng đồng thời, giới hạn sửa, ẩn/audit/thông báo, rollback, điểm trung bình, bộ lọc và chuyển dữ liệu/index.
