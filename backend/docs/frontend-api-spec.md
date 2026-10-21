# **Frontend API Spec (E-commerce Backend)**

Tài liệu này tổng hợp API thực tế từ source code backend hiện tại, bao gồm Admin Dashboard, E-commerce (Food/Combo), Tracking và Upload.

Cập nhật nhóm Foods đến **15/10/2026** (FR-CAT-001/002/003/004/006/007). Các mục dưới đây mô tả hành vi đã có; phần chưa triển khai được ghi ở cuối tài liệu. Các điểm lệch tài liệu của nhóm khác trong đợt rà soát vẫn cần đồng bộ riêng.

Các thay đổi frontend cần tiếp nhận:

- Vai trò hiện tại: `Customer`, `Manager`, `Kitchen Staff`, `Delivery Staff`, `Admin`. Backend đã bỏ API/role PT. Checklist và phạm vi thực hiện: [Vai trò và tài khoản](roles-accounts.md).
- JWT gắn với phiên trong DB; logout thu hồi phiên phía server, reset mật khẩu thu hồi tất cả phiên.
- Refresh trả cặp token mới ở root response; đăng nhập/đăng ký trả token trong `result`.
- Admin tạo bốn vai trò nội bộ qua `POST /users`; Customer tự đăng ký. Manager đọc toàn bộ đơn qua `GET /orders/all`; bếp/giao hàng đọc phần được gán qua `GET /workspace/orders`.
- Món của đơn nằm trong `deliveries[].items[]`; giỏ hàng dùng `_id` của dòng để sửa/xóa.
- Cấu hình backend, seed và tạo index thống nhất `DB_URI` + `DB_NAME`. Frontend chỉ cần URL API; không đưa cấu hình MongoDB hoặc SMTP vào frontend. Xem [hướng dẫn thiết lập](auth-setup.md).

* **Base URL local**: http://localhost:4000  
* **Content-Type**: application/json (Trừ các API Upload dùng multipart/form-data)  
* **Auth**: Bearer JWT qua header Authorization: Bearer <access_token>

## **1) Chuẩn response chung**

Phần lớn endpoint trả về:
```json
{  
  "message": "...",  
  "result": {}  
}
```

Một số endpoint auth trả về trực tiếp object (không có result), ví dụ:
```json
{  
  "access_token": "...",  
  "refresh_token": "..."  
}
```

### **Chuẩn lỗi**

* **Validation lỗi**: HTTP 422
```json
{  
  "message": "Dữ liệu không hợp lệ",  
  "errors": {  
    "fieldName": {  
      "msg": "Nội dung lỗi"  
    }  
  }  
}
```

* **Business lỗi**: HTTP 400 | 401 | 403 | 404 | 409; API quên mật khẩu có thể trả 503 khi thiếu cấu hình email.
```json
{  
  "message": "..."  
}
```

* **JSON body sai format**: HTTP 400
```json
{  
  "message": "Body JSON không hợp lệ. Vui lòng kiểm tra lại cú pháp JSON gửi lên."  
}
```

## **2) Auth + User (/users)**

### **Quy ước xác thực và mật khẩu**

- Endpoint ghi `(Auth)` cần `Authorization: Bearer <access_token>`. Endpoint ghi thêm vai trò còn kiểm tra quyền phía backend.
- Mật khẩu tạo tài khoản/reset: 8–50 ký tự, tối đa 72 byte UTF-8; `confirm_password` phải trùng. Backend hiện không bắt buộc riêng chữ hoa, chữ thường, số hoặc ký tự đặc biệt.
- Frontend gửi mật khẩu qua HTTPS khi triển khai. Backend hash bằng Bcrypt cost 12; frontend không tự hash trước khi gửi.
- Tài khoản SHA-256 đã import được nâng cấp sang Bcrypt khi đăng nhập đúng; cấu hình pepper cũ do backend quản lý.
- Access/refresh JWT có `user_id`, `role`, `status`, `sessionId`, `tokenVersion`, `iat`, `exp`, `token_type`; refresh có thêm `jti`. Frontend không tự thay đổi các field này.
- Middleware xác thực kiểm tra chữ ký, loại token, tài khoản Active, role/version hiện tại và phiên chưa thu hồi/chưa hết hạn. Token cũ thiếu liên kết phiên trả 401; yêu cầu đăng nhập lại.
- `role` giúp frontend chọn giao diện; quyền thực tế được backend kiểm tra. `GET /foods` cũng xác thực phiên trước khi cấp quyền Admin hoặc áp dụng hồ sơ cá nhân.

### **POST /users/register**

Đăng ký tài khoản Customer.

Body:
```json
{  
  "email": "a@example.com",  
  "username": "user01",  
  "password": "Password123",  
  "confirm_password": "Password123",  
  "phone": "0900000000",  
  "role": "Customer"  
}
```

* role: chỉ nhận Customer hoặc bỏ trống; cả bốn vai trò nội bộ không đăng ký qua API này.
* `email`, `username`, `password`, `confirm_password`, `phone` bắt buộc. Username dài 3–30 ký tự; email/username phải chưa tồn tại. Phone hiện chỉ kiểm tra không rỗng, chưa áp dụng regex số điện thoại Việt Nam.
* Email được lưu chữ thường, bỏ khoảng trắng hai đầu. Hồ sơ sức khỏe gửi qua API `/users/health-profile` sau đăng nhập.
* Thành công trả HTTP **200**, tài khoản Active và một phiên đăng nhập mới. Backend hiện vẫn trả token ngay sau đăng ký.

Response (Customer):
```json
{  
  "message": "Đăng ký thành công",  
  "result": {  
    "access_token": "...",  
    "refresh_token": "...",  
    "role": "Customer"  
  }  
}
```

### **POST /users/login**

JWT mới có role/sessionId/tokenVersion; backend kiểm tra phiên trong DB. Token cũ cần đăng nhập lại. Xem [API tạo Manager, khóa tài khoản và reset](auth-setup.md).

- `identifier` nhận email hoặc username; có thể gửi `email` thay thế khi không có `identifier`.
- `remember_me` tùy chọn; gửi boolean JSON `true`/`false`.
- Thời hạn mặc định: access 15 phút, refresh 7 ngày (có thể đổi bằng cấu hình backend). `remember_me: true` đặt hạn refresh 30 ngày. Mỗi lần đăng nhập tạo phiên riêng.
- Response thành công HTTP **200**; `result.role` là một trong năm vai trò hiện tại.

| Trường hợp | HTTP | Hành vi |
| --- | --- | --- |
| Sai email/username hoặc mật khẩu | 401 | Thông báo chung, không cho biết tài khoản có tồn tại hay không. |
| Sai liên tiếp lần thứ 5 | 400 | Khóa tạm 5 phút, các token cũ mất hiệu lực. |
| Đăng nhập trong thời gian khóa tạm | 400 | Báo đang khóa tạm; response hiện chưa có field `locked_until` cho đồng hồ đếm ngược. |
| Admin khóa tài khoản | 403 | Không tự mở khóa khi đăng nhập hoặc reset mật khẩu. |
| Dữ liệu nhập không hợp lệ | 422 | Hiển thị lỗi theo field. |

Sau khi hết hạn khóa tạm, đăng nhập đúng sẽ mở lại tài khoản. Việc này không khôi phục phiên cũ.

Body:
```json
{  
  "identifier": "a@example.com",  
  "password": "Password123",  
  "remember_me": true  
}
```

Response:
```json
{  
  "message": "Đăng nhập thành công",  
  "result": {  
    "access_token": "...",  
    "refresh_token": "...",  
    "role": "Customer"  
  }  
}
```
### **POST /users/logout**

Không cần header access token. Body phải chứa refresh token hiện tại, còn hạn, chưa bị xoay hoặc thu hồi. Backend thu hồi cả access và refresh của phiên đó; các phiên đăng nhập khác vẫn dùng được.

Body:
```json
{ "refresh_token": "..." }
```

Response:
```json
{ "message": "Đăng xuất thành công" }
```

HTTP **200** khi thành công; refresh token không hợp lệ trả **401**. Gọi lại bằng token của phiên đã logout cũng trả 401. Khi thành công, frontend xóa cặp token và trạng thái user cục bộ; chỉ xóa token ở trình duyệt không thay thế việc gọi API này.

### **POST /users/logout-all (Auth)**

Thu hồi mọi phiên của chính tài khoản đang gọi, bao gồm phiên hiện tại. Không cần body và không nhận `user_id` để đăng xuất người khác.

Response HTTP **200**:

```json
{ "message": "Đăng xuất thành công" }
```

Frontend xóa trạng thái đăng nhập và chuyển về trang đăng nhập. Access/refresh của các thiết bị khác sẽ bị từ chối ở lần gọi API tiếp theo.

### **POST /users/refresh-token**

Không cần header access token. Dùng refresh token hiện tại để lấy cặp token mới.

Body:
```json
{ "refresh_token": "..." }
```

Response:
```json
{ "access_token": "...", "refresh_token": "..." }
```
HTTP **200**; response không có `message` hay `result`.

- Lưu **cả hai token mới**. Refresh token cũ không dùng lại được.
- Giữ nguyên sessionId và hạn hết phiên, không kéo dài phiên thêm 7/30 ngày mỗi lần refresh.
- Hai request cùng dùng một refresh token chỉ một request thành công; request còn lại trả 401. Frontend cần dùng chung một tác vụ refresh đang chạy cho các request đồng thời.
- Token hết hạn, đã xoay, đã thu hồi, tài khoản bị khóa hoặc role/version không khớp trả 401.

### **POST /users/forgot-password**

Body:
```json
{ "email": "a@example.com" }
```
Response chỉ có `message`, không trả mã. Mã 6 chữ số được gửi qua email SMTP, hết hạn sau 15 phút và chỉ dùng một lần. Xem [auth-setup.md](auth-setup.md) để cấu hình và test.

Response HTTP **200**:

```json
{ "message": "Vui lòng kiểm tra email để đặt lại mật khẩu" }
```

- Với email hợp lệ về định dạng, thông báo giống nhau dù email có tồn tại hay không.
- Gửi lại trong vòng 60 giây không tạo email/mã mới. Gửi lại sau khoảng này thay mã cũ và đặt lại số lần thử. Frontend có thể đếm ngược 60 giây trước khi cho gửi lại.
- Cấu hình SMTP thiếu/sai định dạng trả **503** với `message: "Chưa cấu hình dịch vụ email đặt lại mật khẩu"`.
- Nếu gửi SMTP thất bại, backend hủy mã chưa gửi, giữ thời gian chờ gửi lại, ghi lỗi chung phía server và vẫn trả thông báo chung. HTTP 200 không bảo đảm email đã được chuyển tới hộp thư.
- Email chứa mã xác nhận, không chứa liên kết hoặc user ID. Không cần `PASSWORD_RESET_URL`.

### **POST /users/reset-password**

API công khai, không cần access/refresh token. Người dùng nhập email và mã 6 chữ số nhận được. `reset_code` phải là chuỗi để giữ số 0 ở đầu. Body cũ dùng `user_id`/`forgot_password_token` không còn được hỗ trợ.

Body:
```json
{  
  "email": "a@example.com",
  "reset_code": "012345",
  "password": "NewPassword123",  
  "confirm_password": "NewPassword123"  
}
```

Response:
```json
{ "message": "Đặt lại mật khẩu thành công" }
```

HTTP **200** khi thành công. Mật khẩu được thay bằng Bcrypt; mã reset bị xóa, tokenVersion tăng và mọi phiên cũ bị thu hồi. API không cấp token đăng nhập mới: frontend đưa người dùng về đăng nhập.

- Mã sai, sai email, hết hạn, đã dùng hoặc quá 5 lần thử trả **401**: `Mã xác nhận không hợp lệ, hết hạn, đã dùng hoặc vượt quá số lần thử. Vui lòng yêu cầu mã mới`. Hiển thị nút yêu cầu mã mới; không gọi API refresh để xử lý lỗi này.
- Email/mã sai định dạng, thiếu field hoặc mật khẩu/xác nhận không hợp lệ trả **422**.
- Hai lần gửi cùng mã chỉ một lần có thể thành công; giới hạn 5 lần thử được kiểm tra ở DB, kể cả request đồng thời.
- Reset không mở khóa tài khoản do Admin khóa. Khóa tạm cũng không được tự xóa bởi endpoint này.

### **GET /users/check-email?email=...**

Response:
```json
{ "exists": true, "message": "Email đã tồn tại" }
```

### **GET /users/check-username?username=...**

Response:
```json
{ "exists": false, "message": "Tên đăng nhập có thể sử dụng" }
```

### **GET /users/me (Auth)**


Response:
```json
{  
  "message": "Lấy thông tin hồ sơ thành công",  
  "result": {  
    "_id": "...",  
    "email": "...",  
    "username": "...",  
    "phone": "...",  
    "role": "Customer",  
    "account_status": "Active",  
    "healthProfile": {}
  }  
}
```

### **PATCH /users/me (Auth)**

Body (optional fields):
```json
{  
  "username": "new_name",  
  "phone": "0911111111",  
  "date_of_birth": "2003-01-01",
  "avatar": "https://example.com/avatar.jpg"
}
```

`avatar` nhận URL HTTP/HTTPS; gửi `null` hoặc chuỗi rỗng để xóa. Chỉ các field trên được cập nhật; API này không đổi `role`, `account_status` hay mật khẩu. Response HTTP 200 dạng `{ "message": "Cập nhật hồ sơ thành công", "result": { ... } }` với user sau cập nhật, không có password/reset token.

### **GET /users (Auth, Admin)**

Tìm kiếm và phân trang cả năm vai trò, bao gồm Admin.

Query: `search` (tối đa 100 ký tự, tìm chuỗi trong email/username/phone, không phân biệt hoa thường), `role` thuộc năm vai trò, `status=Active|Locked`, `page` (mặc định 1, tối đa 1000000), `limit` (mặc định 20, tối đa 100). Ví dụ: `/users?role=Kitchen%20Staff&status=Active&page=1&limit=20`.

Response HTTP **200**: `{ "message": "Lấy danh sách người dùng thành công", "result": { "items": [], "page": 1, "limit": 20, "total": 0 } }`. `total` là số tài khoản khớp bộ lọc, không phải số dòng của trang. Mỗi dòng chỉ gồm `_id`, `email`, `username`, `phone`, `role`, `account_status`, `created_at`; sắp xếp `created_at` và `_id` giảm dần. Không trả hồ sơ sức khỏe hay dữ liệu xác thực. Customer/Manager nhận 403; query sai nhận 422.

### **POST /users (Auth, Admin)**

Admin tạo Manager, Kitchen Staff, Delivery Staff hoặc Admin ở trạng thái Active. Field `role` bắt buộc, không nhận Customer.

Body:

```json
{
  "email": "manager@example.com",
  "username": "manager01",
  "password": "Manager123!",
  "confirm_password": "Manager123!",
  "phone": "0901234567",
  "role": "Manager"
}
```

Các field đều bắt buộc; quy tắc email, username, mật khẩu và phone giống đăng ký.

Response HTTP **201**:

```json
{
  "message": "Account created",
  "result": {
    "_id": "<new_user_id>",
    "email": "manager@example.com",
    "username": "manager01",
    "role": "Manager",
    "account_status": "Active"
  }
}
```

Không trả password hoặc token đăng nhập cho user mới. Backend ghi audit `UserCreated`; người vừa được tạo có thể đăng nhập ngay. Chỉ Admin đầu tiên cần khởi tạo bằng seed.

Lỗi: 401 nếu phiên không hợp lệ; 403 nếu người gọi không phải Admin; 422 nếu validation không đạt (bao gồm role sai hoặc email/username đã tồn tại khi kiểm tra); service có thể trả 409 nếu phát hiện trùng email/username sau bước validation.

### **PATCH /users/:user_id/status (Auth, Admin)**

Admin khóa/mở tài khoản thuộc cả năm vai trò. Backend chặn khóa Admin Active cuối cùng, kể cả khi có yêu cầu đồng thời.

Body:
```json
{ "status": "Locked", "reason": "Tạo đơn giả nhiều lần" }
```

`status` chỉ nhận `Locked` hoặc `Active`; `reason` bắt buộc cho cả khóa/mở, dài 1–500 ký tự sau khi trim.

Response HTTP **200**:

```json
{ "message": "Đã cập nhật trạng thái tài khoản", "changed": true }
```

Khi trạng thái thay đổi, cả khóa và mở khóa đều xóa khóa tạm/bộ đếm đăng nhập sai, hủy token reset đang chờ, tăng tokenVersion và xóa mọi phiên của user. Mở khóa yêu cầu đăng nhập lại; phiên cũ không sống lại. Backend ghi audit `AccountLocked` hoặc `AccountUnlocked` kèm lý do trong cùng transaction. Nếu trạng thái đã đúng, trả `changed: false`, không thu hồi phiên hoặc ghi audit lặp. Riêng tài khoản đang khóa tạm (`Locked` có `locked_until`), Admin gửi `Locked` sẽ chuyển thành khóa lâu dài và trả `changed: true`.

User không tồn tại trả 404; khóa Admin Active cuối cùng trả 409; user_id/status/reason không hợp lệ ở validator trả 422. Người bị khóa nhận đúng lý do khóa khi đăng nhập.

### **PATCH /users/:user_id/role (Auth, Admin)**

Body: `{ "role": "Manager", "reason": "Phân công phụ trách báo cáo" }`. Cho phép đổi giữa năm vai trò; `reason` bắt buộc, 1–500 ký tự sau khi trim. Không được hạ quyền Admin Active cuối cùng.

Response HTTP **200**: `{ "message": "Đã cập nhật vai trò tài khoản", "changed": true }`. Thay đổi role, tăng tokenVersion, thu hồi mọi phiên và ghi audit `RoleChanged` (quyền cũ/mới, người thực hiện, lý do) trong cùng transaction. Tài khoản đang Locked vẫn Locked. User cần đăng nhập lại để nhận role mới. Gửi lại cùng role trả `changed: false`, giữ phiên và không ghi audit lặp.

Lỗi: 401 nếu phiên không hợp lệ, 403 nếu không phải Admin, 404 nếu user không tồn tại, 409 nếu làm mất Admin Active cuối cùng, 422 nếu ID/role/reason sai.

### **POST /users/health-profile (Auth, Customer)**

Body:
```json
{  
  "gender": "Male",  
  "age": 22,  
  "heightCm": 175,  
  "weightKg": 72,  
  "activityLevel": "Moderate",  
  "goal": "LoseFat",  
  "allergies": ["shellfish"]  
}
```

### **GET /users/health-metrics (Auth, Customer)**

Response:
```json
{  
  "message": "Lấy chỉ số sức khỏe thành công",  
  "result": {  
    "gender": "Male",  
    "age": 22,  
    "bmr": 1700,  
    "tdee": 2600,  
    "targetCalories": 2100,  
    "macroDistribution": {  
      "protein": 210,  
      "carb": 158,  
      "fat": 70  
    }  
  }  
}
```

### **POST /users/recommendations/meals (Auth, Customer)**

Body:
```json
{ "days": 1 }
```

* days: chỉ nhận 1 hoặc 7

### **POST /users/recommendations/meals/swap (Auth, Customer)**

Body:
```json
{  
  "current_food_id": "...",  
  "target_calories": 450  
}
```

## 3) Upload Media (`/medias`)

### POST `/medias/upload-image` (Auth)
Upload một file ảnh lên hệ thống (được lưu trữ trực tiếp trên Cloudinary). Dùng cho ảnh đại diện, ảnh món ăn, ảnh đính kèm trong review hoặc ảnh minh chứng giao thất bại của shipper. Backend đọc `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` từ `.env`; client chỉ gửi JWT và file.

- **Headers:**
  - `Authorization: Bearer <access_token>`
  - `Content-Type: multipart/form-data` 

- **Body (form-data):**
  - `image`: [File] Ảnh cần upload (Giới hạn tối đa: 5MB).

**Response:**
```json
{
  "message": "Upload ảnh thành công",
  "result": [
    "https://example.com/images/food.jpg"
  ]
}
```

Với shipper, lấy URL trong `result[0]` để gửi trong `evidenceUrls` của API `shipper-status`. Ảnh không bắt buộc; không có ảnh thì bỏ trường hoặc gửi `[]`, không cần upload.

## **4) Foods (/foods)**

### **GET /foods**

Query optional:

* page, limit (mặc định 1 và 10; số nguyên dương, limit tối đa 100)
* search  
* tags (CSV, ví dụ Vegan,LowCarb)  
* goalTags (CSV: LoseFat,GainMuscle,MaintainWeight)
* excludeAllergens (CSV các dị ứng cần loại trừ, ví dụ Shellfish,Milk)
* excludeMyAllergens: true | false (mặc định true)
* minPrice, maxPrice  
* minCalories, maxCalories  
* sortBy: createdAt | price | calories | name  
* order: asc | desc

**Tìm kiếm tên món — FR-CAT-002:**

* `search` tìm chuỗi con trong tên món, không phân biệt hoa/thường hoặc dấu tiếng Việt; `đ` tương đương `d`. Ví dụ `com ga`, `CƠM GÀ` và `cơm gà` tìm cùng nhóm tên món.
* Bỏ khoảng trắng đầu/cuối, gộp khoảng trắng liên tiếp trong từ khóa; hỗ trợ chữ tiếng Việt dạng Unicode dựng sẵn và tổ hợp. Từ khóa rỗng hoặc chỉ có khoảng trắng không thêm điều kiện tìm kiếm.
* Ký tự như `+`, `.`, `(`, `[`, `*`, `?` được tìm như văn bản thông thường, không được thực thi như biểu thức chính quy. `search` phải là một chuỗi; gửi lặp tham số tạo mảng trả HTTP 422.
* Dùng `normalizedName` đã lưu; món cũ thiếu trường này hoặc có giá trị rỗng được tìm trên `name` với các biến thể dấu tiếng Việt. Không chạy migration hoặc ghi lại món khi tìm kiếm.
* Điều kiện tìm kiếm được kết hợp với bộ lọc và quyền hiện tại trước khi đếm, sắp xếp, phân trang. Response không đổi; `filters.search` vẫn trả từ khóa gốc. Nhánh dữ liệu cũ có thể phải quét tên món, nên không xem đây là tìm kiếm có bảo đảm hiệu năng cho danh mục lớn.

**Phân quyền (Quan trọng):**

* Nếu Header chứa Token của **Admin** còn hiệu lực: Được xem cả món ẩn và hết hàng để quản trị; vẫn áp dụng bộ lọc và phân trang đã yêu cầu.
* Nếu không có token, token đã hết hạn/thu hồi, tài khoản bị khóa hoặc user là **Customer/Manager**: Chỉ trả về món đang bán (`isActive: true`) và còn tồn kho khả dụng (`stock - reservedStock > 0`). Dữ liệu cũ thiếu `reservedStock` được coi là chưa giữ hàng (`0`). Quyền Admin chỉ được cấp sau khi kiểm tra JWT + phiên + role/tokenVersion hiện tại trong DB. Cảnh báo dị ứng cá nhân được mô tả bên dưới.

**Bộ lọc — FR-CAT-003:**

* Theo xác nhận nghiệp vụ, `excludeMyAllergens` **bật mặc định**. Với phiên **Customer** hợp lệ, BE đọc `healthProfile.allergies` mới nhất và loại trừ món phù hợp với bất kỳ dị ứng nào trước khi đếm/phân trang. Không nhận danh tính khách từ query; không trả toàn bộ hồ sơ dị ứng trong response, chỉ trả các giá trị trùng món trong `allergyWarning`.
* Gửi `excludeMyAllergens=false` để bỏ bộ lọc cá nhân cho request đó. Không lưu lựa chọn vào hồ sơ; request kế tiếp thiếu tham số lại dùng mặc định `true`. `excludeAllergens` là bộ lọc nhập trực tiếp, vẫn có hiệu lực khi tắt bộ lọc cá nhân; khi cả hai bật thì loại trừ theo hợp của hai danh sách.
* Khách vãng lai, token không hợp lệ, Customer chưa có hồ sơ/danh sách dị ứng rỗng, Admin và Manager không áp dụng dị ứng cá nhân. Bộ lọc nhập trực tiếp vẫn dùng được cho các trường hợp này. Giữ cách xử lý optional auth hiện có: token không hợp lệ được xem như khách vãng lai.
* `filters.excludeMyAllergens` cho biết trạng thái bật/tắt được yêu cầu; `filters.personalAllergyFilterApplied` chỉ là `true` khi thực sự có quy tắc dị ứng từ hồ sơ Customer được áp dụng. FE không được suy ra đã áp dụng hồ sơ chỉ từ giá trị mặc định `true`.
* Đối chiếu văn bản dị ứng với `ingredients.allergyTags`, tên nguyên liệu và `tags`, không phân biệt hoa/thường hoặc dấu tiếng Việt; so khớp chuỗi con và coi ký tự regex là văn bản thường. Giữ tương thích hồ sơ cũ dùng dấu phẩy/dấu `/` để tách quy tắc và lưu `Vegan`/`ăn chay` trong allergies: quy tắc này chỉ giữ món có tag `Vegan`. Không tự dịch tên dị ứng hay bổ sung từ đồng nghĩa. Không tự thêm `dietaryRestrictions` vào bộ lọc dị ứng.
* `goalTags` lọc theo trường mục tiêu của món, khớp ít nhất một giá trị trong CSV. Không tự dùng mục tiêu hồ sơ để giới hạn danh mục. `tags` giữ hành vi cũ, khớp ít nhất một tag; các nhóm bộ lọc kết hợp bằng AND.
* Khoảng giá/calo gồm cả hai đầu mút, phải là số hữu hạn không âm và min không lớn hơn max. Chuỗi rỗng ở bốn tham số khoảng vẫn được xem là không đặt cận để tương thích API cũ.
* Sắp xếp thêm `_id` cùng chiều làm tiêu chí phụ khi giá/calo/tên/ngày tạo bằng nhau, giúp phân trang ổn định khi dữ liệu không đổi. Trang vượt tổng số trang trả danh sách rỗng và giữ tổng số kết quả đúng.
* Tham số đã liệt kê phải là chuỗi đơn; gửi lặp thành mảng, page/limit sai, khoảng sai, goalTags/sortBy/order không hợp lệ hoặc excludeMyAllergens khác `true`/`false` trả **422**. Bộ lọc tìm kiếm, mục tiêu, dị ứng, calo, giá và tồn kho đều áp dụng trong MongoDB trước count/skip/limit.
* Lọc danh mục không tự chặn xem chi tiết hoặc thêm giỏ theo dị ứng. API chi tiết bổ sung cảnh báo theo FR-CAT-007 nhưng vẫn cho đọc món đang bán kể cả khi trùng dị ứng.

**Cảnh báo dị ứng — FR-CAT-004/007 (BE):**

Mỗi món trong `result.foods[]` và `result` của GET chi tiết đều có cùng cấu trúc:

```json
{
  "allergyWarning": {
    "evaluated": true,
    "hasMatch": true,
    "matchedAllergens": ["shellfish"],
    "matchedIngredients": ["Tôm"],
    "message": "Món có thành phần trùng dị ứng của bạn: shellfish"
  }
}
```

* `evaluated=true` khi có phiên Customer hợp lệ và hồ sơ có danh sách `allergies` (kể cả mảng rỗng). Khách vãng lai, token không hợp lệ, Admin/Manager hoặc chưa khai hồ sơ trả `evaluated=false`, `hasMatch=false`, hai mảng rỗng và `message=null`. Không diễn giải trường hợp chưa đối chiếu thành kết luận không có dị ứng.
* `hasMatch=true` khi ít nhất một dị ứng trong hồ sơ trùng `ingredients.allergyTags`, tên nguyên liệu hoặc `tags` của món. Dùng cùng cách so khớp literal, chuỗi con, có/không dấu và Unicode như FR-CAT-003. `matchedAllergens` là các giá trị đã chuẩn hóa, loại trùng; chỉ trả dị ứng khớp món, không trả phần hồ sơ không liên quan. `matchedIngredients` là tên nguyên liệu khớp (không lặp); có thể rỗng nếu chỉ khớp tag cấp món.
* `Vegan`/`ăn chay` lưu trong hồ sơ cũ vẫn áp dụng quy tắc loại trừ của FR-CAT-003, nhưng không được mô tả thành dị ứng trong `allergyWarning`. Không thêm `dietaryRestrictions` hoặc từ đồng nghĩa vào cảnh báo.
* `excludeMyAllergens=false` chỉ tắt loại trừ danh mục; cảnh báo vẫn được tính. Tham số `excludeAllergens` nhập trực tiếp chỉ dùng lọc, không thay hồ sơ dùng để cảnh báo. GET chi tiết không dùng các query lọc của danh mục; mở thẳng món vẫn nhận cảnh báo nếu có phiên Customer hợp lệ.
* `hasMatch=false` khi không tìm thấy khớp thì `matchedAllergens=[]`, `matchedIngredients=[]`, `message=null`. `allergyWarning` độc lập với `availability`: món hết hàng vẫn có thể có cảnh báo; có cảnh báo không tự làm `canAddToCart=false` và không bổ sung quy tắc chặn giỏ/checkout.
* Hồ sơ được đọc lại mỗi request, cảnh báo chỉ tính khi trả response; không lưu thêm vào Food, không migration. Hai GET trả `Cache-Control: private, no-store` vì response có thể chứa thông tin cá nhân. FE cần bỏ dữ liệu cá nhân cũ khi đổi tài khoản/đăng xuất hoặc tải lại sau khi sửa dị ứng.
* Optional auth có thể trả **200** nhưng `evaluated=false` khi access token hết hạn/thu hồi. FE cần duy trì phiên hợp lệ để nhận cảnh báo cá nhân; không dựa riêng vào interceptor đợi 401 từ hai GET này.
* FE sử dụng `hasMatch` và `message` để hiển thị nhãn/icon/chữ màu đỏ ở danh mục và banner đầu trang chi tiết. Đợt này chỉ hoàn thiện BE; chưa chỉnh sửa giao diện.

**Tồn kho danh mục — FR-CAT-001/006:** Điều kiện còn hàng được lọc trong MongoDB trước khi đếm và phân trang; không lọc bỏ món sau khi đã lấy một trang. Món đã được giữ hết cũng được coi là hết hàng đối với khách. Các trường `images`, `name`, `calories`, `price`, `goalTags` được giữ nguyên để hiển thị thẻ món. Mỗi phần tử trong `result.foods` bổ sung `availability` như API chi tiết bên dưới; dữ liệu này được tính khi đọc, không lưu thêm vào DB. Không tự đổi `isActive` vì hết hàng: khi nhả giữ kho hoặc bổ sung hàng, món đang bán sẽ xuất hiện lại ở lần đọc tiếp theo.

Response:
```json
{  
  "message": "Lấy danh sách món ăn thành công",  
  "result": {  
    "foods": [],  
    "pagination": { "page": 1, "limit": 10, "total": 0, "total_pages": 0 },  
    "filters": {  
      "search": "",  
      "tags": "",  
      "goalTags": "",
      "excludeAllergens": "",
      "excludeMyAllergens": true,
      "personalAllergyFilterApplied": false,
      "minPrice": "",  
      "maxPrice": "",  
      "minCalories": "",  
      "maxCalories": "",  
      "sortBy": "createdAt",  
      "order": "asc"  
    }  
  }  
}
```

### **GET /foods/:food_id**

API công khai với optional auth: có token Customer hợp lệ thì đối chiếu dị ứng cá nhân, thiếu/sai token vẫn đọc được món đang bán. Admin vẫn không xem được món ẩn qua endpoint này. ID sai định dạng trả 422; món không tồn tại hoặc bị ẩn trả 404.

Response: `{ message, result: food }`. Giữ nguyên các trường hiện có, bổ sung `allergyWarning` theo cấu trúc bên trên và `availability`:

```json
{
  "availability": {
    "isActive": true,
    "availableQuantity": 0,
    "inStock": false,
    "canAddToCart": false
  }
}
```

* `availableQuantity = max(0, stock - reservedStock)`; thiếu `reservedStock` dùng `0`. `stock` gốc vẫn là số phần chưa bán, bao gồm phần giữ tạm; không dùng riêng `stock` để quyết định còn hàng.
* `inStock` cho biết còn ít nhất một phần khả dụng; `canAddToCart` chỉ đúng khi món đang bán và còn phần khả dụng. Hai cờ này không xét số lượng món đã có trong giỏ của người gọi.
* Món đang bán nhưng hết hàng vẫn trả HTTP **200** ở chi tiết để phía sử dụng API có thể hiển thị nhãn Hết hàng và vô hiệu nút Thêm vào giỏ theo FR-CAT-006. Món ẩn hoặc không tồn tại trả **404**, kể cả khi mở trực tiếp URL; không thay quyền của endpoint chi tiết.
* Tồn khả dụng là ảnh chụp tại lúc đọc, không phải cam kết giữ hàng. API giỏ kiểm tra lại tổng lượng cùng món trên mọi dòng/ngày/bữa và từ chối thêm/sửa vượt tồn kho hoặc món ngừng bán (HTTP **400**). Checkout tiếp tục giữ/trừ kho bằng transaction; đọc danh mục, chi tiết và thêm giỏ không giữ kho.
* Đợt FR-CAT-001/006 chỉ hoàn thiện backend và hợp đồng API. Giao diện vô hiệu nút, nhãn và lưới món vẫn thuộc phần tích hợp frontend.

### **POST /foods (Auth, Admin)**

FR-ADM-001: chỉ phiên Admin hợp lệ được thêm, sửa hoặc ẩn món. Customer/Manager nhận **403**; thiếu token, token sai/hết hạn/thu hồi nhận **401**.

Body:
```json
{  
  "name": "Chicken Salad",  
  "description": "...",  
  "images": ["https://..."],  
  "price": 79000,  
  "calories": 420,  
  "nutrition": {  
    "protein": 35,  
    "carb": 20,  
    "fat": 15  
  },  
  "ingredients": [  
    { "name": "Chicken breast", "allergyTags": [] }  
  ],  
  "tags": ["HighProtein"],  
  "stock": 20,  
  "isActive": true,
  "goalTags": ["GainMuscle"]
}
```
* Food không còn `details` và `isCombo`. Mô tả dùng `description`; gói tuần được chọn trong Cart/Order.

**Quy tắc dữ liệu dùng chung cho POST/PATCH:**

| Field | Quy tắc |
| --- | --- |
| `name`, `description` | Chuỗi không rỗng sau khi trim. |
| `images` | Mảng có ít nhất một chuỗi không rỗng; trim từng phần tử. Hiện không kiểm tra URL hoặc khả năng tải ảnh. |
| `price` | Số hữu hạn lớn hơn 0. |
| `calories` | Số hữu hạn không âm. |
| `nutrition` | Object đủ `protein`, `carb`, `fat`, mỗi giá trị là số hữu hạn không âm, đơn vị gram. |
| `ingredients` | Mảng có ít nhất một object gồm `name` không rỗng và `allergyTags` là mảng chuỗi không rỗng. `allergyTags: []` hợp lệ khi không khai báo tag dị ứng. |
| `tags` | Mảng chuỗi không rỗng; cho phép `[]`. Đây là tag thông thường, khác `goalTags`. |
| `goalTags` | Mảng giá trị `LoseFat`, `GainMuscle`, `MaintainWeight`; cho phép `[]`, POST bỏ trống mặc định `[]`. |
| `stock` | Số nguyên không âm, không vượt `Number.MAX_SAFE_INTEGER`; là tổng lượng chưa bán gồm cả lượng đang giữ. |
| `isActive` | Boolean; POST bỏ trống mặc định `true`. |

POST bắt buộc mọi field trên trừ `goalTags` và `isActive`. Không chấp nhận `null` thay cho giá trị. Để tương thích, các trường số nhận cả số JSON và chuỗi số hợp lệ rồi lưu thành số; `stock` dạng chuỗi phải gồm chữ số nguyên. `isActive` còn nhận chuỗi `"true"`/`"false"`, nhưng không nhận `0`/`1`. Khuyến nghị FE gửi đúng kiểu JSON. Trim tên, mô tả, đường dẫn ảnh, tag, tên nguyên liệu và tag dị ứng; không tự đổi cách viết hoa/thường của tag.

Chỉ các field trong bảng được ghi. Field ngoài hợp đồng như `_id`, `normalizedName`, `reservedStock`, `rating`, `reviewCount`, `version`, thời gian tạo/sửa, `availability`, `allergyWarning` bị bỏ qua; các field thừa bên trong nutrition/nguyên liệu cũng bị loại. `normalizedName` được BE tính từ tên món để tìm kiếm không dấu.

Thành công trả HTTP **201**: `{ "message": "Tạo món ăn thành công", "result": { ...food } }`, có `_id` vừa tạo. POST/PATCH trả dữ liệu Food lưu trong DB, không bổ sung `availability`/`allergyWarning` như GET danh sách và chi tiết.

Dữ liệu sai trả **422** với `{ "message": "...", "errors": { "field": { "msg": "..." } } }`; lỗi nội dung dinh dưỡng nằm ở `errors.nutrition`, nguyên liệu ở `errors.ingredients`. Request không ghi một phần khi có lỗi. FR-ADM-001 kiểm tra kiểu/miền dữ liệu, chưa triển khai cảnh báo chênh lệch kcal với macro của FR-ADM-002.

### **PATCH /foods/:food_id (Auth, Admin)**

Body: các field trong bảng trên đều tùy chọn, nhưng phải gửi ít nhất một field có thể cập nhật. Field không gửi giữ nguyên. Ví dụ:
```json
{
  "name": "Chicken Salad Updated",
  "price": 85000,
  "stock": 15,
  "isActive": true
}
```

* Khi gửi `nutrition`, phải gửi đủ P/C/F; khi gửi `ingredients`, `images`, `tags` hoặc `goalTags`, giá trị mới thay toàn bộ object/mảng tương ứng. Không ghép ngầm từng thuộc tính của nutrition hoặc từng nguyên liệu. Có thể dùng `tags: []`, `goalTags: []` hoặc `allergyTags: []` trong nguyên liệu để xóa các nhãn tương ứng.
* Body rỗng hoặc chỉ chứa field do server quản lý trả **422** với `errors.body`. Các trường hợp dữ liệu sai khác dùng quy tắc POST.
* Có thể sửa món đang ẩn và dùng `isActive: true` để bán lại. Việc đổi tên cập nhật luôn `normalizedName`; đổi giá/dinh dưỡng chỉ ghi vào Food, không sửa snapshot của đơn cũ.
* Nếu `stock` mới thấp hơn `reservedStock`, trả **409** và không lưu bất kỳ field nào của request. Không dùng PATCH để tự thay lượng đang giữ kho.
* ID sai định dạng trả **422**; ID hợp lệ nhưng không có món trả **404**. Thành công **200**.
* Chống ghi đè giữa hai Admin bằng `version` thuộc FR-ADM-006, chưa triển khai trong đợt FR-ADM-001; gửi `version` hiện không có tác dụng kiểm tra xung đột.

Response:
```json
{
  "message": "Cập nhật món ăn thành công",
  "result": {
     "_id": "...",
     "name": "Chicken Salad Updated",
     "...": "..."
  }
}
```

### **DELETE /foods/:food_id (Auth, Admin)**

Ẩn mềm món bằng `isActive: false`, không xóa document, không sửa tồn kho hoặc lượng đang giữ; dữ liệu đơn cũ được giữ nguyên. Không cần body. Thành công **200**:

```json
{ "message": "Xóa (ẩn) món ăn thành công" }
```

Gọi lại cho món đã ẩn vẫn trả 200. ID sai định dạng trả **422**, không tìm thấy món trả **404**. Sau khi ẩn, khách không thấy món trong danh mục, mở chi tiết nhận 404; Admin vẫn xem món qua danh sách quản trị. Có thể bán lại bằng PATCH `isActive: true`. Thao tác xác nhận trên giao diện thuộc phần FE.

## **5) Cart (/cart) - Customer**

DB chỉ lưu một giỏ/người, chế độ `FOOD` hoặc `COMBO`. [Hướng dẫn đầy đủ, quy tắc và ví dụ](cart.md).

### **GET /cart**

Trả `result.currentCart` là giỏ đang dùng. Vẫn giữ `foodCart`/`comboCart` cho frontend cũ; chỉ một phần có món, cả hai dùng cùng cartId.

Một cart summary có dạng:

```json
{
  "cartId": "<cart_id>",
  "userId": "<user_id>",
  "cartType": "COMBO",
  "version": 2,
  "items": [
    {
      "_id": "<cart_line_id>",
      "itemId": "<food_id>",
      "deliveryDate": "2026-10-08",
      "mealSlot": "Lunch",
      "quantity": 1,
      "itemName": "Cơm gà",
      "unitPrice": 50000,
      "lineTotal": 50000,
      "availability": { "isActive": true, "inStock": true, "availableQuantity": 20 }
    }
  ],
  "canCheckout": false,
  "issues": [
    { "code": "INCOMPLETE_WEEK", "message": "Gói tuần cần có món cho đủ 7 ngày liên tiếp trước khi đặt hàng" }
  ],
  "summary": {
    "lineCount": 1,
    "itemCount": 1,
    "subtotal": 50000,
    "totalCalories": 400,
    "deliveryDates": ["2026-10-08"],
    "shippingFee": null,
    "shippingPolicy": "FIRST_DAY_ONLY"
  }
}
```

* `GET /cart/food`, `GET /cart/combo` hoặc query `?cartType=FOOD|COMBO` trả một phần; rỗng nếu khác chế độ đang dùng.
* `canCheckout=false` khi giỏ rỗng, lịch giao chưa hợp lệ hoặc có món hết hàng/thiếu hàng/ngừng bán. `issues[].lineId` xác định dòng cần hiển thị lỗi.
* Giá/tồn kho lấy lại từ Food mỗi lần đọc; badge dùng `summary.itemCount`.
* Chưa có địa chỉ thì shippingFee=null. Gọi `/orders/quote` sau khi chọn địa chỉ/ngày giao để tính ship; tuần chỉ thu ngày đầu.

### **Thêm, sửa và xóa**

| Method | Path | JSON body |
| --- | --- | --- |
| PATCH | `/cart/mode` | `{ cartType, version? }` — chỉ đổi khi giỏ rỗng |
| POST | `/cart/items` | `{ itemId, quantity, cartType?, deliveryDate?, mealSlot?, mealPlanId?, mealPlanItemId?, version? }` |
| POST | `/cart/items/bulk` | `{ cartType?, version?, items: [{ itemId, quantity, deliveryDate?, mealSlot?, mealPlanId?, mealPlanItemId? }] }` |
| PATCH | `/cart/items/:lineId` | `{ quantity?, deliveryDate?, mealSlot?, version? }` — phải gửi ít nhất một trường cần sửa |
| DELETE | `/cart/items/:lineId` | `{ version? }` |
| DELETE | `/cart` | `{ version? }` |
| DELETE | `/cart/food` hoặc `/cart/combo` | `{ version? }` — chỉ xóa chế độ tương ứng |
| POST | `/cart/refresh` | Lấy lại cart summary, không tự xóa món lỗi |

* API ghi trả summary mới; GET, refresh và DELETE /cart không kèm cartType trả bộ currentCart/foodCart/comboCart.
* cartType không gửi thì dùng chế độ hiện tại (giỏ mới là FOOD). COMBO bắt buộc ngày giao, FOOD chỉ có một ngày giao. Ngày dạng YYYY-MM-DD, không ở quá khứ theo giờ Việt Nam.
* Cho soạn gói tuần chưa đủ ngày; checkout cần đủ 7 ngày liên tiếp. Tối đa 100 dòng; bulk chỉ ghi khi toàn bộ các dòng hợp lệ.
* PATCH quantity=0 xóa dòng; deliveryDate=null bỏ ngày ở FOOD; mealSlot=null bỏ bữa. Nếu sửa trùng dòng khác thì gộp số lượng.
* URL dùng `items[]._id`, là mã dòng giỏ. Food ID cũ chỉ được chấp nhận khi xác định đúng một dòng.
* Gửi version vừa đọc để phát hiện thay đổi từ thiết bị khác; nhận 409 thì tải lại. Version là tùy chọn để tương thích client cũ.
* Món từ MealPlan cần cả hai mã tham chiếu và phải đúng chủ sở hữu/ngày/bữa/món trong thực đơn chưa đặt.
* Ngừng bán/hết hàng sau khi thêm: dòng vẫn hiển thị, trả lỗi tương ứng và chặn checkout. Backend chưa giữ kho tại bước cart.

## **6) Orders (/orders) - Auth bắt buộc**

### **Enum**

* paymentMethod: COD | VNPay | MoMo  
* orderStatus hiện có: Pending | Confirmed | Cooking | Ready | Delivering | Completed | Failed | Cancelled | Rejected. Gói có ngày Failed giữ tiến độ các ngày đang xử lý, kèm `hasFailedDeliveries`.
* paymentStatus: Pending | Paid | Failed | PartiallyRefunded | Refunded
* packageType: ONE_DAY | WEEKLY_7D  
* cartType: FOOD | COMBO

### **POST /orders/quote (Customer)**

Chỉ Customer được gọi; Admin/Manager nhận 403.

Body:
```json
{  
  "deliveryAddress": "...",  
  "deliveryDate": "2026-04-10",  
  "deliveryTime": "12:00",
  "packageType": "ONE_DAY",  
  "cartType": "FOOD",  
  "distanceKm": 3,  
  "note": "...",  
  "paymentMethod": "COD"  
}
```

Rules:

* packageType mặc định ONE_DAY nếu không gửi.  
* cartType mặc định:  
  * COMBO khi packageType = WEEKLY_7D  
  * FOOD trong các trường hợp còn lại.  
* WEEKLY_7D chỉ cho phép với cartType = COMBO.
* Giỏ tuần phải có món cho đủ bảy ngày liên tiếp, bắt đầu từ `deliveryDate`. Backend dùng món của từng ngày, không nhân cùng một giỏ lên bảy lần.
* Ship chỉ thu ngày đầu; các ngày sau có `shipping.totalFee = 0` và `waivedShippingFee` thể hiện phần miễn.
* `deliveryDate: YYYY-MM-DD` đi cùng `deliveryTime: HH:mm` theo giờ Việt Nam (mặc định 12:00). Hoặc gửi timestamp có múi giờ, ví dụ `2026-10-01T12:00:00+07:00`, không kèm `deliveryTime`. Thay ngày ví dụ bằng ngày tương lai thực tế.
* Gói tuần phải còn trước giờ chốt ngày đầu. Mặc định chốt 20:00 ngày trước; Admin cấu hình qua `/admin/commerce-settings`.
* `distanceKm` được giữ nguyên: FOOD miễn đến 2 km, phần vượt làm tròn lên từng km × 5.000đ; COMBO dưới 5 km miễn, từ 5 km thu 20.000đ. Không truyền thì dùng bản đồ như trước.
* Giỏ tuần thiếu món trả 400 kèm `issues[]`, `replacements[]` với dòng/ngày và các món thay thế phù hợp. Khách sửa giỏ rồi quote lại.

Response chứa:

* cart  
* deliveries[]: date, scheduledAt, cutoffAt (gói tuần), items[], status, statusHistory[], subtotal, shipping, waivedShippingFee
* pricing: subtotal, shippingFee, grandTotal, shippingBreakdowns[], totalCalories, waivedShippingFee
* cancellationPolicy, targetCaloriesSnapshot (gói tuần)
* delivery: address, schedule, daysCount, packageType, cartType
* payment.method

### **POST /orders (Customer)**

Body giống /orders/quote, thêm `cartVersion` lấy từ `result.cart.version` và `idempotencyKey` (8–128 ký tự chữ/số/`_`/`-`). Giữ nguyên key và body khi thử lại sau lỗi mạng.

* Tạo Order, giữ/trừ kho, khóa MealPlan nguồn và xóa giỏ theo version trong cùng transaction. Giỏ bị sửa ở tab khác trả 409; không mất món mới thêm.
* Tạo mới trả 201 với `result.replayed = false`. Gửi lại cùng key/body trả 200 với đơn cũ và `replayed = true`. Cùng key nhưng khác nội dung trả 409.
* Order trả `deliveries[].items[]`; mỗi item có `foodId`, `foodName`, `quantity`, `price`, `calories`, `nutrition` đã chốt lúc đặt. Không còn `order.items` hoặc `order.deliverySchedule`.
* Online giữ kho 15 phút: `inventoryHold.status = Held`, `expiresAt` bằng `paymentDueAt`. Hết hạn chưa có IPN thành công, job chuyển Cancelled và nhả kho. Pending đã Paid không bị job hủy.
* Cả đơn lẻ và tuần COD tạo ở `Pending` (payment vẫn Pending), kho Committed, không có hạn chờ Manager. Cả hai lưu `cutoffAt` theo cùng cấu hình chốt bếp. Online cũng Pending; IPN sau này ghi Paid/chốt kho mà không tự Confirmed. Gói tuần lưu chính sách hủy và target calo tại lúc đặt.
* Xem [checkout-inventory.md](checkout-inventory.md) cho lỗi thiếu hàng, transaction, retry và ranh giới với phần IPN/tự hủy đơn.
* Response gói tuần có `amounts` (tiền sau giảm/đã thu/đã hoàn/chờ hoàn/còn phải trả), tổng `waivedShippingFee`; mỗi ngày có thêm `grandTotal`, `nutritionTotals`, `canCancel`. Không còn `canSwap`; món cố định sau checkout. `grandTotal` gốc không giảm khi hủy ngày; UI dùng `amounts.payableTotal`/`amountDue` để hiển thị số thực tế.

### **GET /orders**

Customer lấy đơn của mình, sắp xếp mới nhất trước. Admin/Manager dùng `/orders/all`. Response HTTP 200 dạng `{ "message": "...", "result": [] }`.

### **GET /orders/all (Admin, Manager)**

Lấy toàn bộ đơn trên hệ thống, sắp xếp `createdAt` giảm dần. Response HTTP **200** dạng `{ "message": "Lấy danh sách tất cả đơn hàng thành công", "result": [] }`; Customer gọi trả 403. Hiện chưa có query lọc hoặc phân trang cho danh sách này.

Manager dùng endpoint này để xem đơn; quyết định đơn, duyệt yêu cầu hủy và đối soát phải qua các API vận hành riêng.

### **GET /orders/:orderId**

Lấy chi tiết order, response HTTP 200 dạng `{ "message": "...", "result": { ... } }`:

- Customer chỉ đọc đơn của mình; đơn không tồn tại hoặc thuộc người khác trả 404.
- Admin/Manager được đọc chi tiết mọi đơn.
- Chi tiết món đọc từ `result.deliveries[].items[]`.

### **PATCH /orders/:orderId/cancel**

* Customer COD gửi `{ version, reason }`, dùng được cho đơn lẻ và toàn bộ các ngày còn lại của gói tuần. Chỉ Pending/Confirmed chưa nấu và trước cutoff; phần chưa thu tự hủy, phần đã thu chờ Manager duyệt. Response `{ result: { orderId, orderStatus, version, request, changed } }`, đọc `request.status` để biết Pending hay Approved.
* Admin can thiệp phải gửi `exceptionReason` (1–500 ký tự); vẫn không hủy được Completed hoặc Cancelled và phải qua các kiểm tra nghiệp vụ hiện có. Hệ thống ghi lý do vào audit.
* Manager không gọi endpoint này; dùng API duyệt yêu cầu. Luồng online/Admin hiện có vẫn không hủy toàn gói qua endpoint này. Chi tiết: [cod-cancellation-workflow.md](cod-cancellation-workflow.md).

### **PATCH /orders/:orderId/decision (Manager)**

Xác nhận toàn đơn Pending: `{ "status": "Confirmed", "version": 0 }`. Từ chối: `{ "status": "Rejected", "version": 0, "reason": "Bếp quá tải" }`. Online phải có Payment VerifiedIPN thành công, đủ tiền và kho Committed. COD đã trừ kho, xác nhận không trừ lần hai.

Từ chối trả kho và tạo Refund Pending cho khoản đã thu còn cần hoàn (gồm ship), không đánh dấu đã hoàn tiền. Ghi audit và bản ghi thông báo cùng transaction. Version cũ/xung đột trả 409; cùng request đã xử lý trả 200 với `result.replayed: true`. Admin không gọi API này. Xem [hướng dẫn kiểm tra](manager-order-decisions.md).

### **PATCH /orders/:orderId/status**

Body:
```json
{ "status": "Cooking", "exceptionReason": "Xử lý ngoại lệ đã xác minh" }
```

* Chỉ Admin can thiệp ngoại lệ có lý do và audit; thiếu `exceptionReason` trả 403. Manager dùng `/decision` để xác nhận/từ chối Pending; phân công và thao tác bếp dùng [API riêng](order-assignments.md).
* Đơn lẻ theo Confirmed → Cooking → Ready → Delivering → Completed; kho phải Committed, online cần giao dịch VerifiedIPN thành công. Gói tuần trả 400 tại endpoint này; dùng trạng thái từng ngày.

### **POST /orders/:orderId/payments/retry (Customer)**

Chỉ Customer, với đơn thuộc chính mình. Admin/Manager nhận 403. Endpoint hiện chưa tích hợp cổng thanh toán thực tế.

Cả đơn lẻ và tuần chỉ retry khi online Pending, chưa trả, còn hạn và chưa hủy ngày/chốt lịch giao; không cho đổi COD/online. Hold hết hạn được nhả và thử giữ lại kho, không gia hạn paymentDueAt. Response có inventoryHold/paymentDueAt mới. Đơn đã giảm tiền do hủy ngày cần đối soát, không dùng lại giá gốc để thu tiền.

Body:
```json
{ "paymentMethod": "MoMo" }
```

### **PATCH /orders/:orderId/payment-status**

Body:
```json
{  
  "status": "Paid",  
  "transactionId": "TXN-001"  
}
```
* Chỉ Admin được vào endpoint, nhưng sửa payment-status thủ công trả 400 cho cả đơn lẻ và tuần; trạng thái tiền cần cập nhật qua IPN/đối soát thực tế cùng transaction chốt kho.

### **Gói tuần: thao tác theo ngày và cấu hình bếp**

| Method | Endpoint | Quyền |
| --- | --- | --- |
| GET | `/orders/:orderId/deliveries/:deliveryId/cancellation` | Customer chủ đơn / Admin |
| POST | `/orders/:orderId/deliveries/:deliveryId/cancel` | Customer chủ đơn / Admin |
| PATCH | `/orders/:orderId/deliveries/:deliveryId/status` | Admin |
| GET, PATCH | `/admin/commerce-settings` | Admin |

Hủy gửi `{ "reason": "...", "version": 0 }`; trạng thái gửi `{ "status": "Cooking", "version": 0 }`. Admin phải thêm `exceptionReason` vào các API ngoại lệ; thiếu lý do trả 403. Version cũ trả 409. Manager dùng API `/decision` cho toàn đơn Pending và API phân công riêng từng ngày bên dưới.

Món trong đơn ngày/gói tuần cố định sau checkout cho mọi vai trò, cả trước cutoff và khi Confirmed. Hai API cũ `GET .../items/:itemId/alternatives` và `PATCH .../items/:itemId` đã gỡ, trả 404. Không có API yêu cầu/duyệt đổi hay bộ đếm lượt đổi.

Hủy chỉ trước cutoff của ngày Pending/Confirmed, xem preview trước xác nhận. Customer COD đã trả phải chờ Manager duyệt, sau duyệt mới tạo Refund **Pending**; chưa tự hoàn tiền. Preview COD dùng `lines[]` và `requiresApproval`. Trạng thái ngày theo `Confirmed → Cooking → Ready → Delivering → Completed`, chỉ xử lý từ ngày giao, online phải có IPN xác thực. Chính sách hủy, ví dụ ở [weekly-orders.md](weekly-orders.md) và [luồng hủy COD](cod-cancellation-workflow.md).

Luồng hủy COD bổ sung `POST/GET /orders/:orderId/cancellation-requests`, `PATCH /orders/:orderId/cancellation-requests/:requestId` (Manager Approve/Reject) và `GET /workspace/cancellation-requests` (Manager, phân trang). Body và checklist tại [cod-cancellation-workflow.md](cod-cancellation-workflow.md).

### Phân công trực tiếp và bếp

Không chia ca. Đơn lẻ và gói tuần cùng dùng `deliveryId`. Chi tiết body, response và checklist: [order-assignments.md](order-assignments.md).

| API | Quyền | Điều kiện |
| --- | --- | --- |
| `GET /workspace/staff?role=Kitchen%20Staff` | Manager | Chọn nhân viên Active; đổi role sang Delivery Staff khi gán shipper. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/kitchen-assignment` | Manager | Confirmed; body `{ kitchenStaffIds, version, reason }`. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/kitchen-status` | Bếp được gán | Confirmed → Cooking → Ready; body `{ status, version }`. |
| `PATCH /orders/:orderId/deliveries/:deliveryId/shipper-assignment` | Manager | Ready; body `{ assignedShipperId, version, reason }`. |

Không trả tiền trong response bếp. Mọi thay đổi ghi audit và thông báo DB cùng transaction. Quyết định 21/10/2026 dùng [email](email-notifications.md): phân công COD có email; không gửi từng bước chế biến và không dùng WebSocket.

Shipper được gán dùng `PATCH /orders/:orderId/deliveries/:deliveryId/shipper-status` với `{ status, version }`: Ready → Delivering rồi Completed hoặc Failed. COD Completed bắt buộc `codCollectedAmount`; Failed bắt buộc `reason`, còn `evidenceUrls` tùy chọn (bỏ trường hoặc gửi `[]`; nếu có ảnh, tối đa 10 URL HTTPS hợp lệ). Thu COD từng ngày, ghi thiếu/thừa riêng, không tự sửa giá. Chi tiết và checklist: [shipper-workflow.md](shipper-workflow.md).

Manager xử lý COD qua các API sau; hướng dẫn body, response và checklist tại [manager-cod-operations.md](manager-cod-operations.md):

- `GET /workspace/cod-issues?kind=All&page=1&limit=20`: danh sách ngày Failed hoặc còn chênh lệch COD.
- `PATCH /orders/:orderId/deliveries/:deliveryId/failure-resolution`: `{ action: "Retry" | "Cancel", version, reason }`. Retry về Ready và cần gán lại shipper; Cancel bỏ tiền món và phí ship của ngày đó.
- `GET /orders/:orderId/deliveries/:deliveryId/cod-reconciliation`: sổ thu/hoàn và số còn thiếu/thừa của ngày.
- `POST /orders/:orderId/deliveries/:deliveryId/cod-reconciliation`: `{ action: "Collect" | "Refund", version, amount, reference, reason }`, chỉ ghi tiền đã thực tế thu bù/trả lại, không xóa nợ.

Job tự hủy ngày COD Failed đủ 24 giờ chưa xử lý. Các thao tác này không trả món đã nấu về kho và không sửa số tiền shipper khai ban đầu.

## **7) Admin Dashboard (/admin)**

### **GET /admin/dashboard-stats (Auth, Admin)**

Thống kê vận hành: số Customer, số món đang bán và số đơn theo từng trạng thái. Không trả doanh thu/chi phí/lãi lỗ. Customer/Manager gọi endpoint này nhận 403. Báo cáo tài chính/Excel của Manager thuộc US-29, chưa có endpoint trong đợt phân quyền này.

Response:
```json
{  
  "message": "Lấy thống kê Dashboard thành công",  
  "result": {  
    "users": {  
      "customers": 9
    },  
    "products": {  
      "foods": 50
    },  
    "orders": {
      "total": 9,
      "byStatus": {
        "Pending": 2,
        "Confirmed": 3,
        "Cooking": 0,
        "Delivering": 0,
        "Completed": 4,
        "Cancelled": 0
      }
    }
  }  
}
```

### **GET /admin/food-diary (Auth, Admin)**

Xem tổng hợp nhật ký ăn của toàn hệ thống từ `daily_health_logs`. Query `days` tùy chọn, mặc định 14; service giới hạn 1–60 ngày. Ngày dùng chuỗi `YYYY-MM-DD` theo múi giờ Việt Nam.

Response HTTP **200** (ví dụ khi chưa có nhật ký):

```json
{
  "message": "Lấy nhật ký thực phẩm toàn hệ thống thành công",
  "result": {
    "days": 14,
    "since": "2026-09-21",
    "summary": {
      "totalRows": 0,
      "totalCalories": 0,
      "orderCalories": 0,
      "manualCalories": 0,
      "mealPlanCalories": 0
    },
    "items": []
  }
}
```

Mỗi item có `userId`, `date`, `totalCalories`, `sources: { Order, Manual, MealPlan }`, `entriesCount`; có thêm `user: { username, email, role }` nếu tìm được user tương ứng. Đây là API tổng hợp theo ngày, không trả toàn bộ chi tiết từng món trong item.

## **8) Tracking (/tracking) - Auth bắt buộc**

### **PUT /tracking/weight**

Body:
```json
{  
  "date": "2026-04-07",  
  "weightKg": 72.5  
}
```

* Nếu cùng ngày đã có dữ liệu: update bản ghi ngày đó.

### **GET /tracking/weight-history**

Response:
```json
{  
  "message": "Lấy lịch sử cân nặng thành công",  
  "result": [  
    { "date": "2026-04-01", "weightKg": 73 },
    { "date": "2026-04-07", "weightKg": 72.5 }
  ]  
}
```

### **POST /tracking/calories**

Body:
```json
{  
  "date": "2026-04-07",  
  "caloriesConsumed": 320,  
  "note": "uống trà sữa"  
}
```

* Dùng để ghi calories nhập tay.

### **GET /tracking/calories**

Response:
```json
{  
  "message": "Lấy lịch sử calo thành công",  
  "result": {  
    "targetCalories": 2100,  
    "history": []  
  }  
}
```

### **GET /tracking/calories/today**

Response:
```json
{  
  "message": "Lấy calo hôm nay thành công",  
  "result": {  
    "targetCalories": 2100,  
    "date": "2026-04-08",
    "caloriesConsumed": 920,  
    "entries": []  
  }  
}
```

* Ngày tracking trả chuỗi YYYY-MM-DD theo múi giờ Việt Nam. `history[]` có `targetCalories` của từng ngày và `entries[]` là các món đã ăn.
* Khi order chuyển Completed, backend ghi món trong các delivery đã Completed vào đúng `delivery.date`. Gọi lại cùng suất ăn không cộng trùng.
* Cân nặng, món đã ăn và lịch sử đổi hồ sơ nằm chung collection `daily_health_logs`; mỗi người chỉ có một document/ngày.

## **9) Reviews (/reviews)**

### **POST /reviews (Auth)**

Body:
```json
{  
  "foodId": "<food_id>",
  "orderId": "<order_id>",
  "deliveryId": "<completed_delivery_id>",
  "rating": 5,  
  "comment": "Rất ngon",  
  "images": ["https://..."]  
}
```

* Chỉ Customer sở hữu đơn được đánh giá món thuộc đúng ngày giao `Completed`; không đợi toàn gói tuần hoàn tất. Bắt buộc `orderId`, `deliveryId`, `foodId`.
* Mỗi bộ **đơn + ngày giao + món** có một đánh giá, kể cả đánh giá đã bị ẩn. Cùng món ở hai ngày được đánh giá riêng; số lượng hoặc bữa lặp cùng ngày không nhân review.
* Body cũ `targetType: Food` + `targetId` vẫn được nhận thay `foodId`; không thay thế `orderId`/`deliveryId`. Nếu truyền cả hai ID món thì chúng phải giống nhau.
* Sau tạo/sửa/ẩn, backend tính lại `Food.rating` và `Food.reviewCount` từ đánh giá hiển thị trong cùng transaction. Không còn đánh giá hiển thị thì cả hai bằng 0.

### **GET /reviews/:targetType/:targetId**

* targetType: Food
* Query tùy chọn: `rating=1..5`, `hasImages=true|false`, `page=1`, `limit=20` (tối đa 100). Chỉ trả đánh giá hiển thị, mới nhất trước.

Response:
```json
{  
  "message": "Lấy danh sách đánh giá thành công",  
  "result": []  
}
```

### **PATCH /reviews/:review_id (Auth)**

Chỉ Customer là tác giả được sửa trong 7 × 24 giờ từ lúc tạo. Chỉ nhận `rating`, `comment`, `images`, ít nhất một field. Không đổi đơn/ngày/món/tác giả hoặc tự bỏ ẩn. Đủ 7 ngày trả 409; sửa của người khác trả 403.

Body (Các trường là tùy chọn):
```json
{
  "rating": 4,
  "comment": "Ngon nhưng hơi ít",
  "images": ["https://..."]
}
```

Response:
```json
{
  "message": "Cập nhật đánh giá thành công"
}
```

### **PATCH /reviews/:review_id/hide (Auth, Admin)**

Ẩn đánh giá, bắt buộc body `{ "reason": "Lý do vi phạm" }` dài 1–500 ký tự sau trim. Lưu audit và thông báo tác giả; tính lại điểm trong cùng transaction. Owner và các vai trò khác không có quyền ẩn.

`DELETE /reviews/:review_id` giữ làm alias cho thao tác ẩn này, cũng bắt buộc lý do; không xóa bản ghi.

Response:
```json
{
  "message": "Đã ẩn đánh giá và thông báo lý do cho tác giả",
  "changed": true
}
```

Gọi ẩn lại trả `changed: false`, không nhân audit/thông báo. Xem [hướng dẫn review và migration](reviews-workflow.md) trước khi dùng database có index cũ.

## **10) Gợi ý tích hợp frontend (quan trọng)**

### **Đọc đúng response**

| Endpoint | Vị trí dữ liệu |
| --- | --- |
| Register, login | `response.result.access_token`, `response.result.refresh_token`, `response.result.role` |
| Refresh token | `response.access_token`, `response.refresh_token` |
| Logout, logout-all, forgot-password, reset-password, đổi trạng thái user | `response.message`, không có `result` |
| Admin tạo user | `response.result` chứa user mới, HTTP 201; không có token |
| Danh sách user/đơn | `response.result` là mảng; chưa có pagination |

### **Refresh và kết thúc phiên**

1. Chỉ xử lý refresh cho 401 từ request cần access token; loại trừ login, register, logout, logout-all, forgot-password, reset-password và refresh-token khỏi interceptor tự refresh. Lỗi 401 của reset có nghĩa mã xác nhận không hợp lệ, hết hạn, đã dùng hoặc vượt số lần thử; không phải lỗi hết phiên đăng nhập.
2. Nếu nhiều request cùng nhận 401, chờ chung **một** request refresh đang chạy. Gửi boolean thật cho `remember_me` khi đăng nhập.
3. Khi refresh thành công, lưu đồng thời cặp token mới rồi thử lại request ban đầu tối đa một lần. Không tiếp tục dùng refresh token cũ.
4. Refresh trả 401 hoặc request đã thử lại vẫn trả 401: xóa trạng thái đăng nhập và chuyển về login. Lỗi mạng/5xx cần được hiển thị riêng, không tạo vòng lặp refresh.
5. Lỗi 403 là không đủ quyền; không refresh để thử vượt qua. Render trang không có quyền hoặc ẩn thao tác tương ứng.
6. Với logout, đợi tác vụ refresh đang chạy kết thúc rồi gửi refresh token mới nhất. Sau 200 hoặc 401, xóa trạng thái cục bộ. Nếu lỗi mạng, không báo rằng server đã thu hồi phiên; chỉ xóa cục bộ không bảo đảm thu hồi phía server.
7. Reset thành công: bỏ token cũ của tài khoản trên client và yêu cầu đăng nhập lại. Logout-all cũng kết thúc phiên đang dùng.

### **Quyền đã có cho màn hình quản trị/đơn hàng**

| Chức năng | Customer | Admin | Manager | Kitchen Staff / Delivery Staff |
| --- | --- | --- | --- | --- |
| Tạo nội bộ, tìm/lọc/phân trang user, khóa/mở, đổi role | Không | Có; bảo vệ Admin Active cuối cùng | Không | Không |
| Giỏ hàng, sức khỏe, thực đơn, tracking, tạo/sửa review | Dữ liệu của mình | Không | Không | Không |
| CRUD món | Không | Có | Không | Không |
| Quote/tạo đơn, retry thanh toán | Đơn của mình | Không | Không | Không |
| `/orders/all` và chi tiết đầy đủ | Chỉ chi tiết đơn mình | Có | Có | Không |
| `/workspace/orders` | Không | Có | Có | Chỉ phần được gán; giới hạn trường |
| `/orders/:orderId/decision` | Không | Không | Xác nhận/từ chối toàn đơn Pending | Không |
| Sửa/hủy ngày giao qua API hiện có | Theo điều kiện hiện có | Ngoại lệ có lý do/audit | Chưa có thao tác riêng ngày | Chưa có thao tác bếp/giao mới |
| Sửa payment-status thủ công | Không | Không | Không | Không |
| Sổ giao dịch `/workspace/transactions` | Không | Có | Có | Không |
| Báo cáo tổng hợp/Excel | Chưa có | Chưa có | Chưa có | Không |

Cart, Tracking, Health Profile, gợi ý thực đơn và tạo/sửa review đã được giới hạn Customer ở backend. `/users/me`, đăng xuất và upload dùng chung cho các vai trò có phiên hợp lệ. Danh mục món và danh sách review vẫn công khai. Customer chỉ sửa review của mình trong 7 ngày; Admin ẩn review có lý do, audit và thông báo.

### **Form và dữ liệu đã đổi schema**

- Form đăng ký/tạo user/reset dùng chung quy tắc 8–50 ký tự, tối đa 72 byte UTF-8 và xác nhận khớp; không áp thêm quy tắc “password mạnh” chưa có trong backend. `days` gợi ý thực đơn chỉ nhận 1 hoặc 7.
- Form reset nhận email, mã 6 chữ số và mật khẩu mới, gọi `/users/reset-password`. Với mã hết hạn/đã dùng/hết lượt, cho phép yêu cầu mã mới sau thời gian chờ 60 giây; không cần user đăng nhập trước.
- Gọi `/orders/quote` để hiển thị chi phí dự kiến trước khi tạo đơn. Dùng `deliveries[]` để render từng ngày và `deliveries[].items[]` cho món.
- Sau thêm/sửa/xóa giỏ, đồng bộ UI bằng response mới; dùng `_id` dòng giỏ khi cập nhật/xóa. Một Food có thể xuất hiện ở nhiều ngày/bữa.
- Không gửi `Food.details`, `Food.isCombo`, không đọc `order.items`/`order.deliverySchedule`. Tracking dùng ngày Việt Nam `YYYY-MM-DD`, không tự đổi thành ngày UTC.

## **11) Phần chưa triển khai hoặc cần đồng bộ tiếp**

- Frontend hiện vẫn cần cập nhật các trang/route/API PT cũ, guard vai trò, trang reset email và giao diện Admin tạo/khóa user.
- Backend chưa có báo cáo tài chính/Excel Manager, API liệt kê/xóa riêng phiên theo ID hay API đọc audit log. Có schema/service nội bộ không có nghĩa đã có endpoint public.
- Frontend quản lý user cần đọc `result.items` và `result.total`, gửi `reason` khi khóa/mở/đổi role. Dashboard Admin phải dùng `orders.byStatus`; response không còn `revenue`. Các trang frontend cũ chưa được chuyển trong đợt backend này.
- Checkout đã có giữ/trừ kho bằng transaction, idempotency và job hủy online chưa trả sau 15 phút. Manager đã có API xác nhận/từ chối và tạo yêu cầu hoàn. IPN và hoàn tiền thật qua cổng thanh toán chưa tích hợp; không coi Paid thủ công là xác nhận thanh toán.
- Gói tuần đã có API hủy ngày; món cố định sau checkout, không có chức năng đổi. Customer COD tự hủy chưa thu hoặc yêu cầu Manager duyệt phần đã thu. Manager có phân công bếp/shipper, bếp có Confirmed → Cooking → Ready, shipper có nhận/giao và ghi COD/Failed. Manager xử lý Failed/đối soát và job 24 giờ đã có cho COD. Luồng hủy online và tích hợp cổng thanh toán vẫn cần đồng bộ tiếp. Thông báo chuyển sang [email](email-notifications.md), không làm WebSocket hoặc API danh sách/đánh dấu đã đọc; cần bật worker và SMTP để gửi thật. Review đã có khóa Order–Delivery–Food, sửa trong 7 ngày, lọc sao/ảnh và Admin ẩn có lý do; database cũ cần chạy migration review trước khi dùng. Gợi ý/lựa chọn thực đơn trước checkout hiện chưa lưu MealPlan; các rule dinh dưỡng nâng cao còn cần triển khai.
- Reset qua mã email chỉ chạy thực tế sau khi cấu hình SMTP; không cần URL reset hoặc trang frontend để test bằng Postman. Hướng dẫn DB/seed/email ở [auth-setup.md](auth-setup.md), giải thích 12 collection ở [database_schema.md](../../docs/database_schema.md).
