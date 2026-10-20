# Phân công trực tiếp và xử lý bếp — backend

Theo quyết định mới nhất: **không tạo ca, không kiểm tra trùng ca**. Manager gán nhân viên trực tiếp cho từng đơn/ngày giao. Đơn lẻ có một `deliveryId`; gói tuần dùng `deliveryId` của ngày cần xử lý.

Tham chiếu AUTH-020, ORD-020/021, ADM-008/012/014. Quyết định bỏ ca thay cho các đoạn “thuộc ca mình” trong SRS; file SRS chưa được sửa ở bước này.

## API

Tất cả cần `Authorization: Bearer <access_token>`.

| API | Người gọi | Nội dung |
| --- | --- | --- |
| `GET /workspace/staff?role=Kitchen%20Staff&page=1&limit=20` | Manager | Nhân viên bếp Active để chọn; đổi role thành `Delivery%20Staff` để chọn shipper. Có `search` theo username/email. |
| `GET /workspace/orders` | Nhân viên nội bộ | Manager/Admin thấy mã phân công; bếp và shipper chỉ thấy phần được gán, theo trạng thái công việc. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/kitchen-assignment` | Manager | Gán/đổi danh sách bếp khi ngày giao **Confirmed**. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/kitchen-status` | Bếp được gán | **Confirmed → Cooking → Ready**. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/shipper-assignment` | Manager | Gán/đổi một shipper khi ngày giao **Ready**. |

Danh sách nhân viên trả `{ result: [{ _id, username, email, role }], page, limit, total }`; mặc định 20, tối đa 100 dòng/trang. Không cấp cho Manager quyền quản lý tài khoản.

Gán bếp (ít nhất một ID, không trùng; danh sách mới thay toàn bộ danh sách cũ):

```json
{ "kitchenStaffIds": ["<kitchen-user-id>"], "version": 0, "reason": "Phân công chế biến" }
```

Bếp bắt đầu nấu; nấu xong gửi `Ready` và version mới:

```json
{ "status": "Cooking", "version": 1 }
```

Gán shipper:

```json
{ "assignedShipperId": "<delivery-user-id>", "version": 3, "reason": "Phân công giao hàng" }
```

`version` là số nguyên của **toàn đơn**, lấy từ `/workspace/orders`, phải tải lại khi nhận 409. `reason` phân công dài 1–500 ký tự sau trim. Cùng phân công/trạng thái với version hiện tại trả `changed: false`, không tăng version hoặc ghi audit/thông báo lặp; gửi version cũ trả 409.

Response thao tác: `{ result: { orderId, deliveryId, status, version, changed } }`. Response phân công thêm `kitchenStaffIds`, `assignedShipperId` nếu có. Response bếp không trả toàn đơn, giá hay thanh toán.

## Kiểm tra nhanh

1. Manager xác nhận đơn qua `/orders/:orderId/decision`, sau đó gán bếp bằng version mới. Gán khi Pending bị chặn.
2. Bếp được gán thấy ngày giao trên `/workspace/orders`; bếp khác không thấy và gọi thao tác nhận 403. Được gán ngày A không tạo quyền xử lý ngày B.
3. Bếp lần lượt gửi Cooking rồi Ready. Nhảy Confirmed → Ready, quay Ready → Cooking hoặc sửa sang Delivering bị chặn. Không xử lý ngày giao tương lai; kho phải Committed; online phải có giao dịch VerifiedIPN thành công và payment Paid/PartiallyRefunded.
4. Manager được đổi bếp trước Cooking; sau Cooking API này chặn thay phân công. Người cũ mất quyền khi đổi bếp. Đây là giới hạn của API phân công hiện tại, chưa có luồng chuyển người nấu dở.
5. Khi Ready, Manager gán/đổi shipper. Người cũ mất ngày giao trong danh sách; người mới thấy. Phân công không tự chuyển Delivering hoặc ghi thu COD.
6. Gán tài khoản Locked, sai role hoặc không tồn tại trả 409. Thiếu ID/version/lý do hoặc trùng ID trả 422. Vai trò khác Manager không được phân công, kể cả Admin qua API vận hành này.
7. Hai thao tác dùng cùng version chỉ một thao tác thay đổi thành công; thao tác còn lại phải tải lại. Lỗi lưu audit/thông báo làm rollback cả phân công/trạng thái.

Chuyển trạng thái ghi actor và thời điểm; phân công ghi audit trước/sau, lý do và thời điểm. Thông báo được lưu DB cùng transaction: bếp nhận thông báo phân công, shipper và khách nhận thông báo gán/đổi shipper, khách nhận thông báo Cooking/Ready. **Chưa có đẩy WebSocket realtime** trong bước này.

Gói tuần chỉ đổi ngày được chọn; trạng thái tổng vẫn theo công đoạn sớm nhất của các ngày chưa hủy. Ready không ghi calo hoặc hoàn tất đơn. API ngoại lệ Admin hiện có cũng đi qua Ready, vẫn cần `exceptionReason`.

## Phạm vi tiếp theo

Nhận hàng/xuất phát, kết quả Completed/Failed và COD thực thu đã có tại [API Shipper](shipper-workflow.md). Với COD, [API Manager](manager-cod-operations.md) đã hỗ trợ đưa Failed về Ready để gán lại shipper, hủy/yêu cầu hoàn và tự hủy khi đủ 24 giờ chưa xử lý. Không tạo collection ca, không thay frontend hay tích hợp cổng thanh toán trong bước này.

## Kiểm thử

Trong thư mục `backend`:

```powershell
npm run test:operations:integration
npm test
npm run build
```

Integration test dùng MongoDB replica set tạm, không dùng DB dự án. Kiểm tra HTTP/JWT, phân quyền, lọc dữ liệu, luồng bếp, gán/đổi người, cạnh tranh ghi và rollback.
