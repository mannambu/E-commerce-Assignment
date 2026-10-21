## Hướng Dẫn Khởi Tạo và Đồng Bộ Dữ Liệu (Database Seeding)

Tài liệu này mô tả toàn bộ quá trình xây dựng bộ dữ liệu mẫu (mock/seed data) cho 12 collection trong database `fitbite_v2_dev`, dựa trên quy chuẩn kiến trúc tại [database_schema.md](database_schema.md) và yêu cầu tính năng tại [func_request.md](func_request.md).

---

## 1. Mục đích và bối cảnh

Để phục vụ kiểm thử tích hợp (integration testing) và trình diễn tính năng giữa Frontend và Backend, hệ thống cần một bộ dữ liệu đầy đủ, phản ánh chính xác chu trình kinh doanh của FitBite:
- Khách hàng có đầy đủ hồ sơ sức khỏe (`healthProfile`) và nhật ký ăn uống 10 ngày (`daily_health_logs`) để hiển thị biểu đồ calo và cân nặng.
- Có sẵn thực đơn gợi ý tuần (`meal_plans`) và giỏ hàng (`carts`).
- Có danh sách đơn hàng (`orders`) trải đều qua các trạng thái (Pending, Cooking, Delivering, Completed, Cancelled).
- Có sổ cái giao dịch (`transactions`) bao gồm cả doanh thu thu tiền và chi phí vận hành để Manager kiểm tra báo cáo tài chính (US-29).
- Có đánh giá món ăn (`reviews`) và thông báo hệ thống (`notifications`).

Toàn bộ script được đặt tại thư mục `backend/scripts/` và tuân thủ nguyên tắc **Idempotent** (sử dụng upsert hoặc kiểm tra tồn tại, cho phép chạy lại nhiều lần mà không sinh rác hay trùng khóa).

---

## 2. Thứ tự thực thi và luồng dữ liệu

Các script được thiết kế chạy tuần tự theo quan hệ phụ thuộc thực thể:

```text
1. seed-settings.ts             -> Khởi tạo cấu hình bếp và sàn
2. seed-staff.ts (Admin/Manager)-> Tạo tài khoản quản trị + ghi AuditLog
3. seed-foods.ts                -> Danh mục 26 món ăn chuẩn calo/macro
4. seed-tracking.ts             -> Hồ sơ sức khỏe & nhật ký 10 ngày của Customer
5. seed-meal-plans.ts           -> Thực đơn gợi ý 7 ngày cho Customer
6. seed-cart.ts                 -> Giỏ hàng mẫu sẵn món
7. seed-orders-transactions.ts  -> 6 đơn hàng + sổ giao dịch + đánh giá món ăn
8. seed-notifications.ts        -> Thông báo người dùng (3 mức ưu tiên)
```

---

## 3. Chi tiết các script khởi tạo (`backend/scripts/`)

### 3.1. `seed-settings.ts` (`npm run seed:settings`)
- **Collection**: `settings` (chỉ 1 document duy nhất có `_id = 'commerce'`).
- **Nội dung**: Giờ chốt đơn nhà bếp (`10:00`), chốt trước ngày giao 1 ngày (`kitchenCutoffDaysBefore: 1`), chính sách hủy đơn và hoàn tiền trước/sau giờ chốt.

### 3.2. `seed-staff.ts` (`npm run seed:admin`, `npm run seed:manager`)
- **Collection**: `users`, `audit_logs`.
- **Nội dung**: Tạo tài khoản Admin (`admin@fitbite.test`) và Manager (`manager@fitbite.test`) với mật khẩu băm Bcrypt cost 12. Ghi nhận thao tác tạo tài khoản vào `audit_logs` trong cùng transaction.

### 3.3. `seed-foods.ts` (`npm run seed:foods`)
- **Collection**: `foods`.
- **Nội dung**: 26 món ăn giàu dinh dưỡng (ức gà, cá hồi, thịt bò, đậu hũ, sinh tố, salad...). Đầy đủ thông số Calo, Macro (Protein, Carb, Fat), nguyên liệu và nhãn dị ứng chuẩn.

### 3.4. `seed-tracking.ts` (`npm run seed:tracking`)
- **Collection**: `users`, `daily_health_logs`.
- **Nội dung**:
  - Tính toán và cập nhật `healthProfile` cho `customer@fitbite.test` (Nam, 25 tuổi, 175cm, 72kg, mức vận động vừa, BMR = 1.700 kcal, Target Calories = 2.635 kcal).
  - Khởi tạo 10 ngày liên tục trong `daily_health_logs` (cân nặng giảm dần từ 73.8kg xuống 72.0kg; mỗi ngày có 3-4 bữa ăn sáng, trưa, tối, phụ với calo và macro chuẩn).
  - Phục vụ kiểm thử US-07, US-08, US-09, US-22 (Biểu đồ cân nặng) và US-23 (Tiến trình calo trong ngày).

### 3.5. `seed-meal-plans.ts` (`npm run seed:meal-plans`)
- **Collection**: `meal_plans`.
- **Nội dung**: Thực đơn gợi ý 7 ngày mẫu (`durationDays: 7`) gắn với hồ sơ của Customer, mỗi ngày gồm các bữa ăn được phân bổ calo cân đối (US-10).

### 3.6. `seed-cart.ts` (`npm run seed:cart`)
- **Collection**: `carts`.
- **Nội dung**: Giỏ hàng loại `FOOD` chứa 2 phần ăn mẫu cho tài khoản `customer@fitbite.test` và `seed.customer@ecommerce.local` (US-17).

### 3.7. `seed-orders-transactions.ts` (`npm run seed:orders`)
- **Collection**: `orders`, `transactions`, `reviews`.
- **Nội dung**:
  - Tạo 6 đơn hàng mẫu:
    - 2 đơn `Completed` (1 đơn lẻ và 1 combo tuần 7 ngày có lịch giao).
    - 1 đơn `Delivering` (Đang giao).
    - 1 đơn `Cooking` (Đang nấu).
    - 1 đơn `Pending` (Chờ thanh toán online qua VNPay, khóa kho tạm thời `inventoryHold: 'Held'`).
    - 1 đơn `Cancelled` (Đã hủy có lý do).
  - Tạo giao dịch thanh toán (`kind: 'Payment'`) cho các đơn hoàn tất qua VNPay và COD.
  - Tạo 2 giao dịch chi phí vận hành (`kind: 'Expense'`): Chi phí nguyên liệu thực phẩm (4.200.000 VNĐ) và bao bì đóng gói (850.000 VNĐ) phục vụ kiểm thử màn hình báo cáo tài chính của Manager (US-29).
  - Tạo đánh giá 5 sao (`reviews`) cho các món ăn thuộc đơn đã giao thành công (Verified Purchase - US-26).

### 3.8. `seed-notifications.ts` (`npm run seed:notifications`)
- **Collection**: `notifications`.
- **Nội dung**: 5 thông báo với đủ 3 mức ưu tiên: Khẩn (`Urgent`), Thường (`Normal`), Tin tức (`News`) bám sát US-25.

### 3.9. `seed-all.ts` (`npm run seed:all`)
- **Master Script**: Tự động thực thi toàn bộ chuỗi kịch bản trên theo đúng thứ tự logic, sau đó in bảng tổng kết số lượng document của toàn bộ database.

---

## 4. Danh sách tài khoản kiểm thử (Test Matrix)

| Email | Mật khẩu | Vai trò | Chức năng kiểm thử chính |
| :--- | :--- | :--- | :--- |
| `customer@fitbite.test` | `Customer123!` | Customer | Dashboard sức khỏe (biểu đồ calo & cân nặng 10 ngày), 6 đơn hàng, giỏ hàng có sẵn, 5 thông báo. |
| `admin@fitbite.test` | `Admin123456!` | Admin | Quản lý danh mục món ăn (CRUD), vận hành 6 đơn hàng (chuyển trạng thái Cooking -> Delivering -> Completed). |
| `manager@fitbite.test` | `Manager123456!` | Manager | Báo cáo tài chính: Doanh thu món ăn, chi phí nguyên liệu, lãi/lỗ ròng từ collection `transactions`. |
| `seed.customer@ecommerce.local` | `Customer123!` | Customer | Khách hàng dự phòng có sẵn giỏ hàng. |
| `locked@fitbite.test` | `Customer123456!` | Customer | Kiểm thử chức năng khóa tài khoản vi phạm (đăng nhập bị từ chối). |

---

## 5. Hướng dẫn chạy

### Chạy toàn bộ dữ liệu mẫu (Khuyến nghị)
Tại thư mục `backend`:
```powershell
npm run seed:all
```

### Chạy riêng lẻ từng module (Khi cần cập nhật cục bộ)
```powershell
npm run seed:settings
npm run seed:foods
npm run seed:tracking
npm run seed:meal-plans
npm run seed:cart
npm run seed:orders
npm run seed:notifications
```

---

## 6. Lưu ý khi kiểm tra trên MongoDB Compass

Sau khi chạy lệnh `seed:all`, nếu MongoDB Compass đang mở sẵn các tab collection từ trước, Compass sẽ không tự động làm mới giao diện. 

Để hiển thị dữ liệu mới nhất:
- Bấm nút **`Find`** (màu xanh lá) tại góc phải thanh tìm kiếm của từng tab.
- Hoặc bấm tổ hợp phím **`Ctrl + R`** (hoặc `F5`) để tải lại toàn bộ Compass.
