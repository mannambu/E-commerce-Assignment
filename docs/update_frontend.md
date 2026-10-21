# Báo Cáo Tổng Kết Nâng Cấp Hệ Thống FitBite (Frontend & Full-Stack E2E)

**Phiên bản:** 2.4.0 (Production-Ready)  
**Ngày hoàn thành:** 22/10/2026  
**Nhánh Git:** `develop`  
**Commit Message:** `update_frontend`  

---

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU ĐẠT ĐƯỢC

Dự án **FitBite (Healthy Meal Platform)** đã được rà soát, tái cấu trúc, sửa lỗi và hoàn thiện toàn diện từ Backend tới Frontend đạt tiêu chuẩn Production. Trọng tâm tập trung vào trải nghiệm người dùng (**Customer Experience**), quy trình nghiệp vụ đặt bữa ăn lành mạnh theo tuần/ngày, tính toán chỉ số sức khỏe khoa học, và đồng bộ hóa với 5 vai trò hệ thống: `Customer`, `Manager`, `Kitchen Staff`, `Delivery Staff`, `Admin` (loại bỏ hoàn toàn vai trò `PT`).

### Các tiêu chuẩn kiến trúc cốt lõi đã áp dụng (Core Guardrails):
1. **Không Hardcode (Zero Hardcoding):** Toàn bộ API URL đọc từ `import.meta.env.VITE_API_URL` (Frontend) và `.env` (Backend). Không hardcode ID món, ID người dùng hay phí ship.
2. **Nguồn sự thật duy nhất (Single Source of Truth):**
   - Hợp đồng API thực tế bắt đầu trực tiếp tại `/users`, `/foods`, `/cart`, `/orders`, `/tracking`, `/reviews`, `/medias`, `/admin`, `/workspace` (KHÔNG có `/api/v1`).
   - Quên mật khẩu dùng mã OTP 6 chữ số gửi qua email SMTP (hiệu lực 15 phút, tối đa 5 lần thử, cooldown 60 giây), không dùng link reset.
   - Món ăn trong đơn hàng được cố định sau khi checkout (`canSwap` đã bỏ). Hoán đổi món (Swap) chỉ thực hiện trên màn hình Gợi ý thực đơn (`WF-08`) hoặc xử lý thay thế trước checkout.
3. **Đồng nhất UI/UX & Non-Functional Requirements (NFRs):**
   - 100% ngôn ngữ Tiếng Việt (`NFR-USA-001`).
   - Responsive hoàn hảo trên thiết bị di động (<768px touch target >=44px) (`NFR-USA-002`, `NFR-USA-005`).
   - Xử lý đủ 4 trạng thái: Đang tải (Skeleton/Spinner), Trống (Empty State), Có dữ liệu (Data State), và Lỗi kèm nút Thử lại (`NFR-USA-003`).
   - Cảnh báo dị ứng, trạng thái đơn, tiền tệ và cảnh báo vượt calo luôn hiển thị kèm **Icon + Chữ**, không chỉ dựa vào màu sắc (`NFR-USA-004`).

---

## 2. NÂNG CẤP BACKEND & SEED DATA

### 2.1. Tài khoản Test Customer Gmail Thực
- **Email:** `phuc.nguyen28102005p@hcmut.edu.vn` (nhận dạng case-insensitive: `Phuc.nguyen28102005p@hcmut.edu.vn`)
- **Tên đăng nhập (Username):** `Huy Phúc` (hỗ trợ tiếng Việt có dấu và khoảng trắng)
- **Mật khẩu (Password):** `123456Phuc!`
- **Vai trò (Role):** `Customer`
- **Trạng thái:** `Active`
- **Hồ sơ sức khỏe (HealthProfile):** Đã khởi tạo đầy đủ (Nam, 21 tuổi, 172cm, 68kg, Moderate, LoseFat, Target 2,050 kcal).
- **Sổ địa chỉ:** Đã tạo sẵn địa chỉ giao hàng mặc định tại TP.HCM.
- **Script Seed Idempotent:** `backend/scripts/seed-customer.ts`, tích hợp vào `npm run seed:customer`.

### 2.2. Khoa Học Tính Calo & BMR An Toàn (`FR-HLT-008`, `FR-HLT-002`)
- **Công thức BMR:** Mifflin-St Jeor:
  - Nam: `10 * weight + 6.25 * height - 5 * age + 5`
  - Nữ: `10 * weight + 6.25 * height - 5 * age - 161`
- **TDEE:** Nhân theo 5 mức vận động: Sedentary (1.2), Light (1.375), Moderate (1.55), Active (1.725), Very Active (1.9).
- **Target theo mục tiêu:**
  - `LoseFat`: -15% TDEE
  - `GainMuscle`: +10% TDEE
  - `MaintainWeight`: 0%
- **Sàn an toàn BMR:** Nếu `Target < BMR`, tự động áp `Target = BMR` và bật cờ `targetAdjustedToBmr: true`.
- **Ràng buộc lứa tuổi:** Người dùng 10–15 tuổi chỉ được chọn `MaintainWeight` và yêu cầu xác nhận phụ huynh; dưới 16 tuổi không được chọn `LoseFat`.

### 2.3. Quên Mật Khẩu Qua Mã OTP SMTP & Đăng Nhập Đa Năng
- `POST /users/forgot-password`: Chuẩn hóa email, sinh OTP 6 số ngẫu nhiên, lưu Bcrypt hash, hạn 15 phút, cooldown gửi lại 60s, gửi qua Nodemailer SMTP.
- `POST /users/reset-password`: Xác thực OTP (tối đa 5 lần thử sai), đặt lại mật khẩu mới, hủy toàn bộ phiên trong bảng `sessions` và tăng `tokenVersion`.
- Đăng nhập `POST /users/login`: Nhận trường `identifier`, hỗ trợ đăng nhập bằng cả Email lẫn Username tiếng Việt có dấu.

### 2.4. Kết Quả Kiểm Thử Backend
- **Tất cả 86/86 Unit & Integration Tests PASS (100%)** qua lệnh `npm --prefix backend test`.
- **ESLint Backend:** 0 errors qua `npm --prefix backend run lint`.
- **TypeScript Build Backend:** Biên dịch thành công qua `npm --prefix backend run build`.

---

## 3. NÂNG CẤP FRONTEND TOÀN DIỆN

### 3.1. Dịch Vụ API & Điều Hướng Phân Quyền
- **`frontend/src/services/api.ts`:** Cấu hình Axios interceptor với cơ chế **Single-Flight Refresh Token**. Tự động xếp hàng các request đồng thời khi token hết hạn; loại trừ nghiêm ngặt các endpoint xác thực (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/refresh-token`). Lỗi 403 (cấm quyền) không kích hoạt refresh token.
- **`frontend/src/context/AuthContext.tsx`:** Quản trị trạng thái đăng nhập, hỗ trợ đầy đủ 5 vai trò (`Customer`, `Manager`, `Kitchen Staff`, `Delivery Staff`, `Admin`), đồng bộ sổ địa chỉ và hàm cập nhật hồ sơ.
- **`frontend/src/App.tsx`:** Định tuyến bảo vệ theo vai trò (`ProtectedRoute`), phân luồng Dashboard tự động theo quyền hạn, lazy loading trang mượt mà.

### 3.2. Luồng Xác Thực (Authentication)
- **Chuẩn hóa Placeholder UI (Zero Hardcoded Personal Info):** Toàn bộ thông tin cá nhân của người dùng test (`Phuc.nguyen...`, `Huy Phúc`) đã được gỡ bỏ hoàn toàn khỏi các `placeholder`, `defaultValue` trên toàn bộ giao diện (`Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `Profile.tsx`), chuyển thành các câu hướng dẫn sản phẩm chuẩn mực.
- **Đăng ký (`Register.tsx` - `WF-01`):** Hỗ trợ nhập tên tiếng Việt có dấu, kiểm tra độ mạnh mật khẩu (>=8 ký tự, chữ hoa, số, ký tự đặc biệt), checkbox bắt buộc đồng ý Điều khoản Dịch vụ, hiển thị lỗi 422 chi tiết từ server.
- **Đăng nhập (`Login.tsx` - `WF-03`):** Nhận diện `identifier` (Email hoặc Tên đăng nhập tiếng Việt), nút bật/tắt ẩn hiện mật khẩu, ghi nhớ đăng nhập `remember_me`. Xử lý lỗi 401 thông báo chung, lỗi 400/423 khóa tạm thời 5 phút với đồng hồ đếm ngược, lỗi 403 khóa vĩnh viễn kèm lý do của Admin.
- **Quên mật khẩu (`ForgotPassword.tsx` - `WF-04`):** Quy trình 2 bước trực quan: Bước 1 gửi mã OTP về email có đồng hồ đếm ngược 60 giây gửi lại; Bước 2 nhập mã OTP 6 chữ số và mật khẩu mới kèm xác nhận.

### 3.3. Tài Khoản Cá Nhân & Sổ Địa Chỉ (`Profile.tsx` - `US-32`)
- **Quản lý hồ sơ:** Đổi ảnh đại diện qua `POST /medias/upload-image`, cập nhật Tên hiển thị, Số điện thoại, Ngày sinh.
- **Sổ địa chỉ giao hàng:** Thêm mới, chỉnh sửa, xóa và thiết lập Địa chỉ mặc định (bảo toàn duy nhất 1 địa chỉ mặc định).
- **Bảo mật:** Đổi mật khẩu tài khoản và nút "Đăng xuất khỏi tất cả các thiết bị" (`POST /users/logout-all`).

### 3.4. Nghiệp Vụ Khách Hàng (Customer Core Journey)
1. **Khảo sát sức khỏe (`HealthSurvey.tsx` - `WF-06`, `WF-07`):**
   - Wizard 3 bước: Thông tin thể trạng (Giới tính, Tuổi, Chiều cao, Cân nặng, Cân nặng mục tiêu) → Mức độ vận động & Mục tiêu → Dị ứng & Hạn chế ăn uống.
   - Tính toán trực quan thẻ BMR, TDEE, Calo mục tiêu và phân bổ Macro (Đạm, Carbs, Béo).
   - Hiển thị cảnh báo sàn BMR an toàn và miễn trừ trách nhiệm y tế trước khi lưu.
2. **Gợi ý thực đơn cá nhân hóa (`UserMenu.tsx` - `WF-08`):**
   - Hỗ trợ xem thực đơn 1 ngày (4 bữa) hoặc trọn gói 7 ngày (28 bữa).
   - Thanh tiến độ Calo mục tiêu kèm cảnh báo độ lệch mềm (±10%).
   - Xử lý trạng thái thiếu kho ("Quá ít món hợp").
   - Popover hoán đổi món (Swap) gọi `POST /users/recommendations/meals/swap`.
   - Nút thêm toàn bộ vào giỏ hàng (`FOOD` cho đơn ngày, `COMBO` cho gói tuần).
3. **Danh mục món ăn (`FoodCatalog.tsx` - `WF-10`):**
   - Khắc phục triệt để lỗi HTTP 422: Sử dụng `sortBy=createdAt` (chuẩn camelCase theo backend spec thay cho `created_at`).
   - Phân định rõ ràng các tham số lọc: `goalTags` (`LoseFat`, `GainMuscle`, `MaintainWeight`) và `tags` (`Vegan`, `LowCarb`), loại bỏ hoàn toàn tham số rỗng.
   - Xử lý tách biệt rõ ràng giữa **Trạng thái Lỗi (Error State)** có Icon cảnh báo + thông báo lỗi + nút "Thử lại", và **Trạng thái Trống (Empty State)** khi kết quả tìm kiếm thực sự rỗng (`NFR-USA-003`).
   - Tìm kiếm món ăn thông minh chuẩn hóa tiếng Việt bỏ dấu / có dấu.
   - Bộ lọc mục tiêu (Giảm cân, Tăng cơ, Duy trì), khoảng calo, khoảng giá, sắp xếp theo giá và calo.
   - Toggle tự động loại trừ món có chất dị ứng trùng với người dùng (`excludeMyAllergens`).
   - Huy hiệu cảnh báo dị ứng màu đỏ kèm Icon + Chữ trên từng thẻ món ăn.
4. **Chi tiết món ăn (`FoodDetails.tsx` - `WF-11`):**
   - Banner cảnh báo dị ứng cá nhân hóa màu đỏ nổi bật ở đầu trang nếu món chứa thành phần trùng với dị ứng của khách hàng (`NFR-USA-004`).
   - Kiểm tra tồn kho: Nếu hết hàng (`OUT_OF_STOCK` hoặc tồn <= 0) hoặc ngừng kinh doanh (`DISCONTINUED`), nút đặt hàng tự động bị vô hiệu hóa kèm Icon và thông báo rõ ràng.
   - Bảng phân tích dinh dưỡng chi tiết (Đạm, Carbs, Béo, Calo, Chất xơ, Natri).
   - Tích hợp component Đánh giá & Bình luận (`ReviewSection.tsx`).
5. **Giỏ hàng (`Cart.tsx` - `WF-14`):**
   - Hiển thị huy hiệu chế độ giỏ hàng: Đơn món lẻ (`FOOD`) vs Gói Combo tuần (`COMBO`).
   - Cảnh báo các vấn đề của giỏ hàng (`issues[]`) và cờ dị ứng trên từng dòng sản phẩm.
   - Khóa nút thanh toán kèm thông báo khi `canCheckout === false`.
   - Nút làm mới giỏ hàng khi xảy ra xung đột phiên bản (409 Conflict).
6. **Thanh toán đơn hàng (`Checkout.tsx` - `WF-15`, `WF-16`):**
   - Tự động điền thông tin và địa chỉ mặc định từ Sổ địa chỉ người dùng.
   - Cung cấp bộ chọn nhanh giữa các địa chỉ đã lưu hoặc nhập địa chỉ mới.
   - Gọi `POST /orders/quote` để tính phí vận chuyển chính xác theo khoảng cách và giờ giao 12:00.
   - Xử lý phương thức thanh toán tiền mặt COD (thông báo tính năng VNPay/MoMo đang nâng cấp).
   - Hỗ trợ Idempotency Key chống đặt trùng đơn khi mạng chập chờn.
   - Modal thông báo đặt hàng thành công hiển thị Mã đơn hàng và nút chuyển tiếp về Dashboard.
7. **Theo dõi đơn hàng & Tổng quan (`UserDashboard.tsx` - `WF-15`, `WF-26`):**
   - Huy hiệu trạng thái đơn hàng đầy đủ **Icon + Chữ**: Chờ xử lý (`Clock3`), Đã xác nhận (`CheckCircle2`), Đang nấu (`Flame`), Đang giao (`Bike`), Hoàn thành (`CheckCircle2`), Đã hủy (`XCircle`).
   - Modal xem chi tiết đơn hàng: danh sách món, lịch trình giao từng ngày của gói tuần.
   - Quy trình hủy đơn hàng: Modal xem trước hoàn tiền COD và gửi yêu cầu hủy trước giờ cutoff.
   - Nút "Đặt lại" cho các đơn hàng đã hủy hoặc đã hoàn thành.
8. **Nhật ký dinh dưỡng & Cân nặng (`UserDiary.tsx` - `WF-18`, `WF-19`):**
   - Thanh tiến độ calo nạp trong ngày so với mục tiêu; cảnh báo đỏ kèm Icon + Chữ khi calo vượt ngưỡng.
   - Biểu mẫu ghi nhận calo ngoài thực đơn qua `POST /tracking/calories`.
   - Cập nhật cân nặng qua `PUT /tracking/weight`.
   - Kiểm tra biến động cân nặng lớn (>5% trong 7 ngày hoặc >3kg trong 1 tuần, `NFR-HLT-004`): hiển thị modal cảnh báo kèm hộp kiểm xác nhận bắt buộc trước khi lưu.
   - Biểu đồ tiến trình cân nặng và **Bảng dữ liệu lịch sử cân nặng có thể truy cập** (`NFR-USA-006`).
9. **Đánh giá & Bình luận (`ReviewSection.tsx` - `WF-22`):**
   - Đánh giá sao (1-5) và bình luận trải nghiệm.
   - Tải ảnh minh chứng qua `POST /medias/upload-image`.
   - Giới hạn chỉnh sửa đánh giá trong vòng 7 ngày kể từ khi tạo.
   - Bộ lọc đánh giá theo số sao hoặc chỉ xem đánh giá có ảnh.

---

## 4. CHUẨN HÓA BỘ TEST POSTMAN COLLECTIONS (`backend/postman/`)

1. **`Registration-API.postman_collection.json`:**
   - Sử dụng pre-request script sinh dữ liệu ngẫu nhiên theo thời gian thực (`Date.now()`, `timestamp`) cho email, username, phone để không bị trùng lặp khi chạy kiểm thử liên tục.
   - Test case mật khẩu yếu: kiểm tra `< 8` ký tự trả về mã lỗi validation chuẩn `422`.
2. **`Password-Reset.postman_collection.json`:**
   - Cấu hình sẵn tài khoản test mặc định: `Phuc.nguyen28102005p@hcmut.edu.vn`, `Huy Phúc`, `123456Phuc!`.
   - Hỗ trợ đủ 4 bước kiểm thử: (1) Yêu cầu OTP qua email SMTP, (2) Đặt lại mật khẩu với mã OTP 6 số, (3) Đăng nhập bằng Email identifier, (4) Đăng nhập bằng Username tiếng Việt identifier.
3. **`FitBite-E2E-Order-Lifecycle-Flow.postman_collection.json`:**
   - Xây dựng hoàn chỉnh 18 bước E2E Order Lifecycle bao trùm đủ 5 vai trò hệ thống: Customer đặt đơn COD → Manager duyệt và phân công bếp → Bếp chuyển trạng thái Cooking / Ready → Manager phân công shipper → Shipper chuyển trạng thái Delivering / Completed → Customer viết đánh giá → Admin ẩn đánh giá.
   - Sửa lỗi Assertion ở Bước 6.3: kiểm tra `pm.expect(json.changed).to.eql(true)` thay vì `json.result.changed`, đạt **29/29 Test Assertions PASS (100%)**.

---

## 5. KẾT QUẢ KIỂM TRA TỰ ĐỘNG (SELF-HEALING VERIFICATION)

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả | Trạng thái |
| :--- | :--- | :---: | :---: |
| **Backend Unit & Integration Tests** | `npm --prefix backend test` | 86 / 86 passed (100%) | **PASS** |
| **Backend ESLint** | `npm --prefix backend run lint` | 0 errors | **PASS** |
| **Backend TypeScript Build** | `npm --prefix backend run build` | Clean build (`dist/`) | **PASS** |
| **Frontend TypeScript Check** | `npm --prefix frontend run lint` (`tsc --noEmit`) | 0 errors | **PASS** |
| **Frontend Production Build** | `npm --prefix frontend run build` | Vite build hoàn tất (3.77s) | **PASS** |
| **Root Git Ignore** | `git check-ignore` (5 doc files) | 5/5 files excluded | **PASS** |

---

## 6. HƯỚNG DẪN VẬN HÀNH & KIỂM THỬ THỰC TẾ

### 6.1. Khởi chạy Backend
```bash
cd backend
npm install
npm run seed:customer   # Đảm bảo tài khoản Phuc.nguyen28102005p@hcmut.edu.vn đã tồn tại
npm run dev             # Khởi chạy server tại http://localhost:4000
```

### 6.2. Khởi chạy Frontend
```bash
cd frontend
npm install
npm run dev             # Khởi chạy Vite dev server tại http://localhost:5173
```

### 6.3. Tài khoản Đăng nhập Kiểm thử
- **Khách hàng (Customer):** `Phuc.nguyen28102005p@hcmut.edu.vn` (hoặc `Huy Phúc`) / Mật khẩu: `123456Phuc!`
- **Quản lý (Manager):** `manager@fitbite.local` / Mật khẩu: `Manager123!`
- **Bếp (Kitchen Staff):** `kitchen@fitbite.local` / Mật khẩu: `Kitchen123!`
- **Giao hàng (Delivery Staff):** `shipper@fitbite.local` / Mật khẩu: `Shipper123!`
- **Quản trị viên (Admin):** `admin@fitbite.local` / Mật khẩu: `Admin123!`
