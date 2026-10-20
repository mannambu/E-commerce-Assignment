# Vai trò và tài khoản — kiểm tra backend

Tham chiếu: `docs/func_request_ver2.0.md`, AUTH-005/007/016–022 và PTL-001–006. Tài liệu này phân biệt phần backend đã có với phần còn phụ thuộc module đơn hàng/tài chính. Không đánh dấu hoàn tất toàn bộ cụm FR khi các luồng phụ thuộc chưa được triển khai.

## 1. Phần đã triển khai

| Yêu cầu | Backend hiện có | Cách kiểm tra nhanh |
| --- | --- | --- |
| AUTH-005, PTL-001 | Năm vai trò. Đăng ký công khai chỉ tạo Customer. Admin tạo Manager, Kitchen Staff, Delivery Staff hoặc Admin; Active ngay. | Gửi role nội bộ vào `/users/register` → 422. Admin tạo qua `/users` → 201, tài khoản mới đăng nhập được. |
| AUTH-007 | Đăng nhập trả role đã xác thực cho cả năm vai trò. | Kiểm tra `result.role` của `/users/login`. Điều hướng trang là phần frontend, ngoài đợt này. |
| PTL-002 | Admin tìm kiếm, lọc và phân trang tất cả năm vai trò. | `GET /users?role=Kitchen%20Staff&status=Active&page=1&limit=10`. |
| PTL-003, AUTH-019 | Khóa/mở/đổi vai trò cần lý do; thay đổi thu hồi mọi phiên. Đăng nhập tài khoản bị khóa trả lý do khóa. | Token cũ gọi `/users/me` và refresh đều nhận 401. Mở khóa rồi thử lại token cũ vẫn 401. |
| PTL-004 | Không khóa/hạ quyền Admin hoạt động cuối cùng, kể cả hai yêu cầu đồng thời. | Chỉ còn một Admin Active: khóa hoặc đổi sang Manager → 409. |
| PTL-005 | Tạo/khóa/mở/đổi quyền và các can thiệp đơn hiện có được ghi audit cùng transaction. | Kiểm tra actor, entity, before/after, reason, createdAt trong collection audit. Không ghi mật khẩu/token. |
| AUTH-017/018 | API kiểm tra JWT, phiên, tài khoản và role tại server. Sai vai trò → 403; phiên/claim bị sửa hoặc thu hồi → 401. | Dùng token nhân viên gọi `/users`, `/cart`, sửa món hoặc tạo đơn → 403. |
| AUTH-020/021 (giới hạn truy cập) | Bếp/giao hàng không đọc API đơn đầy đủ; chỉ đọc suất giao được gán qua `/workspace/orders`. Bếp không nhận địa chỉ hay trường tiền. | Gán các suất khác nhau cho hai nhân viên; mỗi người chỉ thấy phần mình. Chưa được gán → danh sách rỗng. |
| AUTH-022, PTL-006 (ngoại lệ) | Admin gọi API sửa trạng thái/hủy hiện có phải có `exceptionReason`; vẫn kiểm tra điều kiện nghiệp vụ. Không có quyền đổi món trong đơn. | Thiếu lý do → 403, không đổi dữ liệu; lý do hợp lệ được lưu trong audit. |
| AUTH-022, PTL-006 (đọc tài chính) | Admin/Manager đọc sổ giao dịch thực tế qua `/workspace/transactions`. | Admin/Manager → 200; Customer/bếp/giao hàng → 403. |

## 2. API quản lý tài khoản

Các API dưới đây cần `Authorization: Bearer <access_token>` của Admin.

**Tạo nội bộ:** `POST /users`

```json
{
  "email": "kitchen@example.com",
  "username": "kitchen_demo",
  "phone": "0901234567",
  "password": "Kitchen123!",
  "confirm_password": "Kitchen123!",
  "role": "Kitchen Staff"
}

{
    "email": "delivery@example.com",
    "username": "delivery_demo",
    "phone": "0901234568",
    "password": "delivery123!",
    "confirm_password": "delivery123!",
    "role": "Delivery Staff"
}
```

Giữ các trường tên đăng nhập, điện thoại và mật khẩu theo hợp đồng tạo tài khoản đang có. Không có bước chờ kích hoạt hoặc email mời trong API này. Customer tự đăng ký. Admin đầu tiên được tạo bằng `npm run seed:admin`; các Admin tiếp theo có thể tạo qua API.

**Danh sách:** `GET /users?search=kitchen&role=Kitchen%20Staff&status=Active&page=1&limit=10`

Response: `{ "message": "...", "result": { "items": [], "total": 0, "page": 1, "limit": 10 } }`. Chỉ trả trường quản lý: ID, email, username, phone, role, account_status, created_at.

**Khóa/mở:** `PATCH /users/:user_id/status`

```json
{ "status": "Locked", "reason": "Tạm ngừng công tác" }
```

Đổi `Locked` thành `Active` để mở khóa. **Đổi quyền:** `PATCH /users/:user_id/role`

```json
{ "role": "Delivery Staff", "reason": "Chuyển sang bộ phận giao hàng" }
```

`reason` dài 1–500 ký tự sau trim. Cùng giá trị hiện tại trả `changed: false`, không thu hồi phiên hoặc ghi log lặp; chuyển khóa tạm thành khóa lâu dài vẫn là thay đổi. Tài khoản đang Locked không tự mở khóa khi đổi role. Admin có thể quản lý các Admin khác nhưng không được làm mất Admin Active cuối cùng.

## 3. Dữ liệu công việc và ngoại lệ

- `GET /workspace/orders`: tối đa 100 đơn gần nhất khớp bộ lọc, trả từng ngày giao. Manager/Admin đọc danh sách và mã nhân viên được gán; bếp lọc `deliveries.kitchenStaffIds` và trạng thái Confirmed/Cooking; giao hàng lọc `deliveries.assignedShipperId` và trạng thái Ready/Delivering/Failed. Manager gán trực tiếp qua [API phân công](order-assignments.md), không chia ca. Shipper có [API ghi kết quả](shipper-workflow.md), tiền COD cần thu theo ngày và kết quả Failed với lý do bắt buộc, ảnh tùy chọn.
- `GET /workspace/staff`: Manager chọn nhân viên bếp hoặc giao hàng Active; chỉ trả ID, username, email, role. Không thay thế API quản lý tài khoản của Admin.
- `GET /workspace/transactions`: tối đa 100 giao dịch gần nhất, chỉ đọc; gồm ID, loại, trạng thái, số tiền, mã đơn, thời điểm, mô tả. Không phải báo cáo doanh thu đầy đủ hoặc file Excel.
- Các API Admin sửa trạng thái đơn/ngày và hủy đơn/ngày cần thêm `"exceptionReason": "Lý do can thiệp"` vào body hiện có. Lý do không cho phép bỏ qua cutoff, version, thanh toán, tồn kho hay quy tắc chuyển trạng thái; không mở lại chức năng đổi món đã bỏ.

## 4. Phần còn phụ thuộc — chưa nghiệm thu đủ FR

| FR | Phần chưa có trong backend hiện tại |
| --- | --- |
| AUTH-016 | Manager xác nhận/từ chối **toàn đơn Pending** và gán bếp/đổi shipper đã có: xem [API quyết định](manager-order-decisions.md), [API phân công](order-assignments.md). Đã có [xử lý Failed/đối soát COD](manager-cod-operations.md) và [duyệt hủy COD thông thường](cod-cancellation-workflow.md). |
| AUTH-020 | Đã có Confirmed → Cooking → Ready cho bếp được gán đúng ngày giao. Quyết định mới bỏ ca; chưa có WebSocket realtime. |
| AUTH-021 | Đã có nhận/xuất phát, giao thành công với COD thực thu và Failed với lý do bắt buộc, ảnh tùy chọn cho đúng ngày được gán. Xem [API Shipper](shipper-workflow.md) và [Manager xử lý Failed/đối soát COD](manager-cod-operations.md). |
| AUTH-022, PTL-006 | Báo cáo tài chính tổng hợp và đọc file Excel đã xuất. Sổ giao dịch chỉ là bước đọc dữ liệu ban đầu. |

Checkout COD đã đổi sang Pending, trừ kho ngay và không có hạn chờ; online giữ 15 phút bằng hạn thanh toán, quá hạn chưa trả thì job hủy/nhả kho. Manager xác nhận hoặc từ chối qua `/orders/:orderId/decision`. Bếp có API riêng Confirmed → Cooking → Ready; Manager gán/đổi shipper tại Ready. Shipper chuyển Ready → Delivering → Completed/Failed; COD thu từng ngày, lưu thiếu/thừa để đối soát. Manager đã xử lý Failed, ghi nhận tiền thực tế thu bù/trả lại COD; job tự hủy ngày COD Failed đủ 24 giờ chưa xử lý. IPN và gọi cổng hoàn tiền để bước tích hợp cổng riêng. Không dùng các API ngoại lệ Admin để thay thế quy trình vận hành mới. Frontend ngoài phạm vi.

## 5. Chạy kiểm thử

Trong thư mục `backend`:

```powershell
npm test
npm run test:roles:integration
npm run build
```

Integration test khởi tạo MongoDB replica set tạm, không dùng DB dự án. Kiểm tra HTTP/JWT thật, năm role, tạo nội bộ, thu hồi phiên, lọc công việc, ngoại lệ Admin và khóa/hạ quyền đồng thời. Lần đầu có thể cần tải MongoDB binary. Cấu hình chạy ứng dụng vẫn cần Atlas hoặc replica set để hỗ trợ transaction.
