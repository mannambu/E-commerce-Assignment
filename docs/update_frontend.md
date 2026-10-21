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
- **Mật khẩu (Password):** `123456Phuc!` đổi thành `Phuc123456!`
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

---

## 7. CẬP NHẬT SỬA LỖI UI/UX & MÚI GIỜ HỆ THỐNG (22/10/2026)

### 7.1. Chuẩn hóa thanh điều hướng Navbar (`frontend/src/components/layout/Navbar.tsx`)
- **Vấn đề:** Giao diện có 2 nút "Dashboard" đồng thời (một ở thanh menu chính giữa và một ở góc phải cạnh Giỏ hàng/Đăng xuất).
- **Khắc phục:**
  - Thay thế mục "Dashboard" thừa trong `navLinks` bằng liên kết **"Gợi ý thực đơn"** (`/dashboard/menu`) kèm biểu tượng `Sparkles`, kết nối trực tiếp khách hàng tới màn hình gợi ý cá nhân hóa `WF-08`.
  - Giữ nút Dashboard ở góc phải cho điều hướng vai trò tương ứng (`Customer` về `/dashboard/user`, nhân viên về workspace).

### 7.2. Khắc phục lỗi thêm gợi ý thực đơn vào giỏ hàng & Gói tuần 7 ngày (`UserMenu.tsx`, `user.services.ts`, `Checkout.tsx`)
- **Nguyên nhân:** 
  - Hàm `date.toISOString().split('T')[0]` tại Backend và Frontend lấy theo giờ UTC (sau 00:00 giờ VN vẫn là ngày hôm trước UTC), dẫn tới `deliveryDate` bị gán ngày hôm qua.
  - Bộ kiểm tra giỏ hàng (`cart.services.ts`) so sánh `deliveryDate < today` (theo giờ VN) trả về lỗi `HTTP 400 Bad Request: Ngày giao đã qua, hãy chọn lại ngày`.
  - Gói 7 ngày COMBO bắt đầu từ ngày hôm qua nên ngày nào kiểm thử cũng báo "đã qua ngày giao".
- **Khắc phục:**
  - Chuẩn hóa hàm tính ngày `toLocalDate(new Date())` và `getVietnamLocalDate()` theo múi giờ `Asia/Ho_Chi_Minh`.
  - Gói tuần 7 ngày tự động tính ngày giao sớm nhất hợp lệ dựa trên giờ chốt bếp (20:00 VN): nếu trước 20:00 bắt đầu từ ngày mai, nếu sau 20:00 bắt đầu từ ngày kia.
  - Chuyển thao tác thêm món cả ngày `today` trong `UserMenu.tsx` sang gọi `addBulkItems(itemsToAdd, 'FOOD')` nguyên tử, đồng thời kiểm tra cẩn thận `res.success` để thông báo lỗi chính xác khi thêm thất bại thay vì báo thành công giả lập.
  - Tự động đồng bộ ngày nhận hàng trên trang thanh toán `Checkout.tsx` khớp với ngày giao của các món có sẵn trong giỏ hàng.

### 7.3. Khắc phục lỗi Cập nhật Calories không cập nhật vào "Calories hôm nay" (`UserDiary.tsx`)
- **Nguyên nhân:** Ô nhập ngày ghi nhận calories mặc định dùng `new Date().toISOString().split('T')[0]` dẫn tới ngày UTC (21/10/2026), trong khi giờ Việt Nam đã là 22/10/2026. Dữ liệu ghi nhận vào ngày hôm qua nên API `GET /tracking/calories/today` (so với ngày hôm nay) vẫn trả về 0 kcal.
- **Khắc phục:**
  - Chuyển toàn bộ giá trị mặc định của `calorieDate` và `weightDate` sang `getVietnamLocalDate()`.
  - Khi lưu calories thành công, tự động gọi lại `fetchTrackingData()` để cập nhật tức thì thẻ "CALORIES HÔM NAY" và thanh tiến độ dinh dưỡng.

### 7.4. Đa dạng hóa gợi ý thực đơn khi "Làm mới thực đơn" (`backend/src/services/user.services.ts`)
- **Nguyên nhân:** Thuật toán cũ sắp xếp ứng viên calo theo một thứ tự tĩnh tuyệt đối (`sort(...)`), dẫn đến việc mọi lần bấm "Làm mới" và mọi ngày trong tuần đều hiển thị đúng 4 món y hệt nhau.
- **Khắc phục:**
  - Lấy nhóm top ứng viên có lượng calo phù hợp nhất cho từng bữa (`top 3`), sau đó chọn ngẫu nhiên có trọng số nhằm tạo sự phong phú khi người dùng ấn "Làm mới thực đơn".
  - Bổ sung bộ theo dõi `weeklyUsed` xuyên suốt các ngày trong gói 7 ngày để hạn chế lặp món, giúp thực đơn từ Thứ Hai đến Chủ Nhật phong phú và đa dạng.
  - API đổi món `/users/recommendations/meals/swap` trả về danh sách `candidates` (tối đa 10 món thay thế phù hợp) giúp khách hàng dễ dàng lựa chọn trong modal đổi món.



---

## 8. HOÀN THIỆN 5 USER STORIES ĐƯỢC GIAO (US-07, US-08, US-09, US-11, US-17)

### 8.1. Bảng Đối Chiếu Hiện Trạng & Nghiệm Thu (Audit Matrix)

| User Story | Tiêu chí nghiệm thu (AC) & Trường hợp biên (Edge Cases) | Hiện trạng kiểm tra (Audit) | Giải pháp thực hiện (Implementation) | Kết quả |
| :--- | :--- | :--- | :--- | :--- |
| **US-07: Khai báo khảo sát sức khỏe (Epic B)** | - Nhập đủ: Chiều cao (100–250cm), Cân nặng (25–300kg), Tuổi (10–100), Giới tính, 5 mức vận động, Mục tiêu (LoseFat, GainMuscle, MaintainWeight), Dị ứng.<br>- 10–15 tuổi: Chỉ `MaintainWeight` + consent phụ huynh.<br>- <16 tuổi: Không được `LoseFat`.<br>- Tự chuyển hướng từ gợi ý thực đơn kèm thông báo nhắc nhở nếu chưa có hồ sơ. | - Form khảo sát 3 bước đã có validation.<br>- Backend validator đã chặn đúng chuẩn.<br>- Thiếu banner thông báo lý do chuyển hướng khi user chưa có hồ sơ vào thực đơn. | - `UserMenu.tsx` chuyển hướng sang `/health-survey` truyền `state: { notice: 'Vui lòng hoàn thành khảo sát sức khỏe...' }`.<br>- `HealthSurvey.tsx` hiển thị banner cam thông báo nổi bật. | **ĐẠT 100% AC** |
| **US-08: Tính toán chỉ số dinh dưỡng (Epic B)** | - Công thức Mifflin-St Jeor (Nam/Nữ).<br>- 5 hệ số vận động (1.2–1.9).<br>- Điều chỉnh mục tiêu: LoseFat -15%, GainMuscle +10%, MaintainWeight 0%.<br>- Sàn an toàn: `Target >= BMR` kèm cảnh báo Icon + Chữ.<br>- Phân bổ Macro (P/C/F) theo gam làm tròn.<br>- Thiếu trường dữ liệu phải báo lỗi "Chưa đủ dữ liệu để tính chỉ số", không hiển thị `0`/`NaN`. | - Công thức Mifflin-St Jeor và sàn an toàn đã có.<br>- Thiếu guard input kiểm tra rỗng / không hữu hạn tại `calculateHealthMetrics`. | - Bổ sung guard input trong `backend/src/utils/health.ts` ném lỗi `'Chưa đủ dữ liệu để tính chỉ số'` khi thiếu bất kỳ trường nào.<br>- Thêm unit test kiểm tra công thức, sàn BMR và guard missing fields (`87/87 tests pass`). | **ĐẠT 100% AC** |
| **US-09: Cập nhật cân nặng / mục tiêu & tính lại (Epic B)** | - Cập nhật cân nặng/mục tiêu tính lại chỉ số tức thì.<br>- Lưu snapshot vào `profileChanges[]` trong `daily_health_logs`.<br>- Hiển thị **Dòng thời gian (Timeline) lịch sử thay đổi chỉ số** trên WF-07.<br>- Cảnh báo biến động đột ngột (>3kg/tuần, >5%/7 ngày, hoặc >=10kg) kèm modal xác nhận. | - Cập nhật cân nặng và lưu log đã hoạt động.<br>- `getHealthMetrics` chưa trả về mảng `history`.<br>- WF-07 chưa có UI Timeline.<br>- Kiểm tra biến động chưa tính bước nhảy >=10kg ngoài chu kỳ 7 ngày. | - Cập nhật `getHealthMetrics` query `dailyHealthLogs` trả về `history` sắp xếp giảm dần theo thời gian.<br>- Bổ sung UI Timeline lịch sử chỉ số trên `HealthSurvey.tsx` (WF-07).<br>- Cập nhật ngưỡng `UserDiary.tsx`: `(daysDiff <= 7 && (percentDiff > 5 \|\| diffKg > 3)) \|\| diffKg >= 10`. | **ĐẠT 100% AC** |
| **US-11: Gợi ý thực đơn & Đổi món Swap (Epic C)** | - Gợi ý 1 ngày (4 bữa) hoặc 7 ngày (28 bữa).<br>- Đổi món (Swap): Tìm món thỏa calo chênh lệch không quá ±15% và loại trừ dị ứng.<br>- Trả về top 3-5 ứng viên.<br>- Nếu không có món nào thỏa ±15%, trả lỗi 404 / `NO_SWAP_CANDIDATE_FOUND`.<br>- Tính lại tổng Calo & Macro sau đổi món, cảnh báo lệch quá ±10% Target.<br>- Đơn hàng đã chốt KHÔNG có nút đổi món. | - Luồng gợi ý và tính calo đã có.<br>- `swapRecommendedFood` chưa áp bộ lọc cứng `±15%`, có thể chọn món lệch nhiều.<br>- Không có nút swap nào trong chi tiết đơn hàng chốt. | - Thêm bộ lọc `Math.abs(food.calories - expectedCalories) <= expectedCalories * 0.15` trong `user.services.ts`.<br>- Ném lỗi `NO_SWAP_CANDIDATE_FOUND` nếu không còn món thỏa.<br>- Mở rộng pool ngẫu nhiên khi Làm mới thực đơn để tối ưu đa dạng hóa. | **ĐẠT 100% AC** |
| **US-17: Giỏ hàng Server-side Đặt lẻ / Gói tuần (Epic E)** | - Giỏ hàng server-side đồng bộ qua `currentCart`, `version`, `cartType` (`FOOD` vs `COMBO`).<br>- Navbar badge giỏ hàng cập nhật tức thì.<br>- Hiển thị rõ: `mealSlot` (Sáng/Trưa/Tối/Phụ), `deliveryDate`, đơn giá, thành tiền, tổng calo.<br>- Chính sách ship COMBO rõ ràng: chỉ tính ship ngày đầu, 6 ngày sau miễn phí.<br>- Thao tác PATCH/DELETE dòng món qua `item._id` (`lineId`).<br>- Huy hiệu tồn kho trên từng món (Ngừng bán, Hết hàng, Chỉ còn X phần) và cấm thanh toán khi `canCheckout === false`. | - Context đã hỗ trợ đầy đủ các trường server cart.<br>- Giao diện `Cart.tsx` thiếu huy hiệu bữa ăn (`mealSlot`), thiếu huy hiệu trạng thái tồn kho trên từng món, thiếu bảng giải thích chính sách ship COMBO trong Order Summary. | - Bổ sung huy hiệu `mealSlot` (Bữa sáng, Bữa trưa, Bữa tối, Bữa phụ).<br>- Bổ sung huy hiệu tồn kho: "Ngừng bán", "Hết hàng", "Chỉ còn X phần", và lỗi chi tiết của từng dòng món.<br>- Bổ sung thông báo chính sách ship gói tuần COMBO trong phần Tổng kết đơn hàng. | **ĐẠT 100% AC** |

---

### 8.2. Postman Collection Chuyên Biệt cho 5 User Stories
Đã tạo mới file bộ sưu tập Postman:
`backend/postman/FitBite-User-Stories-US07-08-09-11-17.postman_collection.json`
Bao gồm 12 kịch bản kiểm thử tự động với assertions chi tiết:
1. `01. Đăng nhập Customer` (Lưu `customerToken`)
2. `02. US-07: Khai báo khảo sát sức khỏe (POST /users/health-profile)`
3. `03. US-08: Lấy chỉ số BMR, TDEE, Target, Macro (GET /users/health-metrics)`
4. `04. US-09: Cập nhật cân nặng hằng ngày (PUT /tracking/weight)`
5. `05. US-09: Kiểm tra Dòng thời gian lịch sử chỉ số (GET /users/health-metrics)`
6. `06. US-11: Gợi ý thực đơn cá nhân 1 ngày (POST /users/recommendations/meals)`
7. `07. US-11: Gợi ý thực đơn gói tuần 7 ngày (POST /users/recommendations/meals)`
8. `08. US-11: Đổi món (Swap ±15% calo) (POST /users/recommendations/meals/swap)`
9. `09. US-17: Lấy giỏ hàng Server-side (GET /cart)`
10. `10. US-17: Thêm món lẻ vào giỏ hàng (POST /cart/items)`
11. `11. US-17: Cập nhật dòng món theo lineId (PATCH /cart/items/:id)`
12. `12. US-17: Xóa món khỏi giỏ theo lineId (DELETE /cart/items/:id)`

---

### 8.3. Kết Quả Kiểm Tra Chất Lượng (Quality Verification)
- **Backend Tests:** `87/87 tests passed` (100% pass, 0 fail).
- **Backend Lint:** `0 errors`.
- **Backend Build:** `rimraf ./dist && tsc && tsc-alias` thành công.
- **Frontend Build:** `vite build` thành công, sinh bundle sạch (`dist/index.html`).
- **Frontend Lint:** `tsc --noEmit` 0 errors.
