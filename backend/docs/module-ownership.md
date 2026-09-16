# Hướng Dẫn Phân Chia và Quản Lý Module 

Tài liệu này xác định quyền sở hữu module, quy tắc hợp nhất code (merge rules) và quy chuẩn làm việc nhằm giảm thiểu xung đột (conflicts) trong quá trình phát triển dự án.

## 1. Cấu Trúc Module (Module Tree)

Hệ thống được chia thành các module độc lập sau:
- `src/modules/auth`
- `src/modules/user`
- `src/modules/health`
- `src/modules/food`
- `src/modules/pt`
- `src/modules/cart`
- `src/modules/order`
- `src/modules/payment`
- `src/modules/tracking`
- `src/modules/chat-workout`
- `src/modules/notification`
- `src/modules/admin`
- `src/modules/review`

## 2. Bảng Phân Công (Ownership Table)

| Module | Người Phụ Trách (Owner) | Người Review (Backup) | Ghi Chú Tính Năng Trọng Tâm |
| :--- | :--- | :--- | :--- |
| **Auth** | Thành viên B | Thành viên A | Đăng nhập/Đăng ký/Quên mật khẩu/Token |
| **User** | Thành viên B | Thành viên A | Hồ sơ cá nhân/Cài đặt tài khoản |
| **Health** | Thành viên B | Thành viên A | Khảo sát sức khỏe/Tính BMR-TDEE/Macro |
| **Food** | Thành viên A | Thành viên B | Danh mục món ăn/Chi tiết/Bộ lọc |
| **PT** | Thành viên B | Thành viên A | Hồ sơ PT/Danh sách PT/Các gói dịch vụ |
| **Cart** | Thành viên A | Thành viên B | Quản lý giỏ hàng/Số lượng/Tổng tiền |
| **Order** | Thành viên A | Thành viên B | Thanh toán (Checkout)/Vòng đời đơn hàng |
| **Payment** | Thành viên A | Thành viên B | Tích hợp cổng thanh toán (VNPay/MoMo) |
| **Tracking** | Thành viên B | Thành viên A | Theo dõi cân nặng & Calo tiêu thụ hàng ngày |
| **Chat-workout** | Thành viên B | Thành viên A | Chat (PT - Khách hàng)/Giao bài tập |
| **Notification** | Thành viên B | Thành viên A | Thông báo chuông/Sự kiện hệ thống |
| **Admin** | Thành viên A | Thành viên B | Trang quản trị/Duyệt PT/Vận hành |
| **Review** | Thành viên A | Thành viên B | Đánh giá xác thực (Verified)/Chấm điểm (Rating) |

## 3. Quy Tắc Hợp Nhất (Merge Rules)

Để hạn chế tối đa xung đột code (conflicts), nhóm cần tuân thủ các nguyên tắc sau:

1. **Nguyên tắc 1-1:** Mỗi module chỉ do một Owner chịu trách nhiệm viết code chính. Backup Reviewer chỉ tham gia review, không can thiệp code trừ khi được phân công trực tiếp.
2. **Không lấn ranh giới:** Tuyệt đối không chỉnh sửa code thuộc module của người khác trong cùng một Pull Request (PR) nếu chưa có sự thống nhất trước.
3. **Quản lý file dùng chung:** Mọi thay đổi trên các file dùng chung (như `src/index.ts`, constants, schemas) phải được thực hiện trên một branch riêng biệt (vd: `chore/integration-*`).
4. **Chia nhỏ PR:** Khuyến khích tạo các PR nhỏ (từ 200-400 dòng code). Thực hiện ghép code (integration) ít nhất 2 lần/ngày.
5. **Cập nhật code liên tục:** Luôn thực hiện lệnh `rebase` từ nhánh `develop` trước khi tạo PR mới.
6. **Đồng bộ tài liệu:** Nếu có bất kỳ thay đổi nào liên quan đến API contract (DTO, response, status code), bắt buộc phải cập nhật Postman/Swagger ngay trong PR đó.

## 4. Quy Chuẩn Đặt Tên Nhánh (Branch Naming Convention)

Sử dụng định dạng sau để đặt tên nhánh:

**Cho các tính năng mới (Feature branches):**
- `feature/member-a-food-catalog`
- `feature/member-a-checkout-payment`
- `feature/member-b-health-metrics`
- `feature/member-b-chat-workout`

**Cho các tác vụ dọn dẹp, tích hợp (Chore branches):**
- `chore/integration-routes`
- `chore/integration-shared-types`

## 5. Tiêu Chuẩn Hoàn Thành (Definition of Done - DoD)

Một module/tính năng chỉ được xem là hoàn thành (Done) khi đáp ứng đủ các tiêu chí:

- [ ] Tài liệu API (API contract) đã được cập nhật đầy đủ.
- [ ] Hoàn thiện các cơ chế xác thực dữ liệu (Validation) và thông báo lỗi.
- [ ] Đã kiểm thử (test) thành công ít nhất một kịch bản đúng (happy path) và một kịch bản lỗi (error path).
- [ ] Vượt qua quá trình build và công cụ kiểm tra lỗi cú pháp (lint) ở môi trường local.
- [ ] PR không chứa các thay đổi ở những file dùng chung không liên quan đến tính năng đang làm.