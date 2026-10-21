# Đồng bộ màn hình Admin với backend hiện tại

Ngày đối chiếu: 22/10/2026. Chỉ thay đổi frontend; giữ bố cục shell, sidebar, header, theme Admin và các kiểu bảng/card/modal hiện có.

## Căn cứ

- `docs/func_request_ver2.0.md`: AUTH-007, AUTH-016–022, PTL-001–006 và các yêu cầu quản lý món, đánh giá, cấu hình.
- `backend/docs/frontend-api-spec.md`, `roles-accounts.md`, `weekly-orders.md`, `reviews-workflow.md`.
- Đối chiếu trực tiếp routes, middleware, controllers và services. Với phần tài liệu còn ví dụ cũ, dùng hợp đồng đang chạy trong code BE.

## Các thay đổi

| Màn hình | Trước | Sau / API đang dùng |
| --- | --- | --- |
| Đích đăng nhập Admin | Tổng quan tài chính cũ | Quản lý người dùng WF-05, `/dashboard/admin/users` |
| Người dùng | Chưa có | `GET /users` với search/role/status/page/limit; `POST /users` tạo 4 vai trò nội bộ; `PATCH /users/:id/status` và `/role` có reason. Customer chỉ tự đăng ký. |
| Tổng quan / thống kê | Đọc `revenue` không còn trong response | `GET /admin/dashboard-stats`: khách hàng, món đang bán, tổng đơn và đủ 9 trạng thái; không giả lập doanh thu/lợi nhuận. |
| Món ăn | limit=300 bị BE từ chối; chỉ giữ ảnh/nguyên liệu đầu tiên; gửi details/isCombo | Phân trang 20 món; tìm kiếm và lọc mục tiêu phía server; trạng thái lọc trên trang được ghi rõ vì BE chưa có bộ lọc này. Giữ toàn bộ images/ingredients/allergyTags, thêm goalTags; phân biệt stock/reservedStock/availableQuantity. |
| Đánh giá món | Xóa không gửi lý do | Lọc sao/ảnh, phân trang; `PATCH /reviews/:id/hide` với reason bắt buộc, hiển thị xác nhận trước khi ẩn. |
| Đơn hàng | Thiếu Ready/Failed/Rejected, sai schema items, thao tác vận hành trực tiếp | Đọc `/orders/all` và `/orders/:id`; hiển thị deliveries/items, lịch sử, phân công, COD và khoản hoàn. Ngoại lệ đơn ngày dùng API cấp đơn; gói tuần dùng cấp ngày. Bắt nhập exceptionReason; hủy ngày phải xem preview, gửi version; 409 yêu cầu xem lại dữ liệu. |
| Sổ giao dịch | Dữ liệu mẫu và nút xuất giả | `GET /workspace/transactions`, lọc trong tối đa 100 giao dịch gần nhất; chỉ đọc. Pending refund không coi là đã hoàn. |
| Báo cáo doanh thu / chi phí | Công thức sai hoặc dữ liệu mẫu | Trang doanh thu giải thích chưa khả dụng; chi phí đọc giao dịch Expense. Không tạo/sửa chi phí hoặc giả lập xuất Excel. |
| Giờ chốt bếp | Chưa có | `GET/PATCH /admin/commerce-settings`, giờ HH:mm và ngày chốt 0/1; giải thích chỉ áp dụng đơn mới. Chính sách hủy chỉ đọc. |
| Nhật ký thực phẩm | `Legacy`, giả định user luôn tồn tại | `MealPlan`/`mealPlanCalories`; xử lý user bị xóa mà không lỗi render. |
| Thành phần dùng chung | Admin vẫn gọi giỏ và thấy hồ sơ sức khỏe | Chỉ Customer tải giỏ/sửa sức khỏe. Sidebar đăng xuất qua server. Refresh dùng chung khi nhiều request cùng hết phiên, loại trừ API auth và kết thúc phiên khi bị thu hồi. |

## Phạm vi chưa có trên BE

Báo cáo tài chính/Excel tổng hợp, API đọc audit log, quản lý/xóa phiên riêng theo ID, thông báo realtime và bộ lọc trạng thái món phía server chưa có endpoint phù hợp. Không tự tạo các chức năng đó. Các thao tác Manager, Kitchen Staff và Delivery Staff không được đưa vào quyền Admin. Các màn hình làm việc của ba vai trò này nằm ngoài đợt cập nhật Admin.

## Hoàn thiện luồng ngoại lệ

- Khi đổi bộ lọc, phân trang, ngày hủy hoặc tải lại, dữ liệu của request trước không còn được dùng trong lúc chờ request mới; request cũ bị hủy khi rời màn hình.
- Chuyển trạng thái gói tuần kiểm tra ngày giao theo giờ Việt Nam, trạng thái đơn/ngày giao, kho đã chốt và trạng thái thanh toán online trước khi chế biến. BE vẫn kiểm tra giao dịch VerifiedIPN và toàn bộ điều kiện tại thời điểm cập nhật.
- Hủy ngày giao yêu cầu bản xem trước khớp orderId, deliveryId và version của chi tiết đang xem; kiểm tra lại thời hạn chốt khi gửi. Có nút tải lại bản xem trước nếu lỗi mạng. Khi phiên bản không khớp, tải lại chi tiết rồi chọn lại thao tác.
- Lỗi 409 giữ thông báo nghiệp vụ từ BE (ví dụ chưa chốt kho hoặc thiếu chính sách hủy), đồng thời tải lại dữ liệu. Không gán mọi lỗi 409 thành xung đột phiên bản.
- Form sửa món chặn tồn kho thấp hơn reservedStock đang hiển thị. BE vẫn kiểm tra nguyên tử vì số lượng giữ có thể thay đổi sau khi mở form.

## Kiểm tra

Chạy trong `frontend`: `npm run lint`, `npm run build`, `npm run test:admin`. Bộ test dùng TypeScript stripping có sẵn trong Node 22.6+ (đã chạy với Node 24), không cần cài thư viện mới.

Kết quả kiểm tra tự động: TypeScript và production build thành công; 10 test hồi quy thành công, gồm biên ngày UTC/Việt Nam, điều kiện chốt kho/thanh toán, bản xem trước sai đơn/ngày/phiên bản và hết hạn. Kiểm tra diff không có thay đổi backend. Build có cảnh báo annotation từ thư viện Zod, không chặn build. Chưa chạy E2E với BE/DB thật hoặc kiểm tra trực quan vì phiên làm việc không có trình duyệt kết nối.

Các tình huống cần chạy với BE/DB thử nghiệm:

- Đăng nhập Admin vào WF-05; tìm/lọc và qua trang; tạo nội bộ; lỗi trùng email/tên; khóa/mở/đổi quyền có lý do; BE chặn Admin Active cuối cùng; thay đổi chính mình kết thúc phiên.
- Sửa món có nhiều ảnh/nguyên liệu không làm mất dữ liệu; tồn kho không thấp hơn lượng đang giữ; ẩn/mở bán; lọc review và ẩn có lý do.
- Xem đơn ONE_DAY/WEEKLY_7D có đủ trạng thái; không có thao tác xác nhận Pending/phân công/đối soát của Manager; ngoại lệ có lý do, hủy ngày có preview, version cũ trả 409 và tải lại.
- Sổ giao dịch không suy doanh thu từ tổng giá trị đơn và không coi Refund Pending là đã hoàn; dữ liệu rỗng/lỗi có thông báo.
- Lưu giờ chốt 0/1 và kiểm tra lại; mở hồ sơ Admin không có form sức khỏe; không gọi `/cart` bằng phiên Admin.
