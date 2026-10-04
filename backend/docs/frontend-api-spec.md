# **Frontend API Spec (E-commerce Backend)**

Tài liệu này tổng hợp API thực tế từ source code backend hiện tại, bao gồm Admin Dashboard, E-commerce (Food/Combo), Tracking và Upload.

Cập nhật ngày **04/10/2026**, đối chiếu routes, middleware, controller và service. Các mục dưới đây mô tả hành vi đã có; phần chưa triển khai được ghi ở cuối tài liệu.

Các thay đổi frontend cần tiếp nhận:

- Vai trò hiện tại: `Customer`, `Admin`, `Manager`. Backend đã bỏ API/role PT.
- JWT gắn với phiên trong DB; logout thu hồi phiên phía server, reset mật khẩu thu hồi tất cả phiên.
- Refresh trả cặp token mới ở root response; đăng nhập/đăng ký trả token trong `result`.
- Admin tạo Customer/Manager qua `POST /users`; Manager đọc toàn bộ đơn qua `GET /orders/all`.
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
- `role` giúp frontend chọn giao diện; quyền thực tế được backend kiểm tra. Ngoại lệ còn tồn tại ở optional auth của `GET /foods` được ghi tại mục Foods.

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

* role: chỉ nhận Customer hoặc bỏ trống; Admin/Manager không đăng ký qua API này.
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
- Response thành công HTTP **200**; `role` có thể là `Customer`, `Admin` hoặc `Manager`.

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
Response chỉ có `message`, không trả token. Liên kết được gửi qua email SMTP, hết hạn sau 15 phút và chỉ dùng một lần. Xem [auth-setup.md](auth-setup.md) để cấu hình và test.

Response HTTP **200**:

```json
{ "message": "Vui lòng kiểm tra email để đặt lại mật khẩu" }
```

- Với email hợp lệ về định dạng, thông báo giống nhau dù email có tồn tại hay không.
- Gửi lại trong vòng một phút không tạo email/token mới. Gửi lại sau khoảng này sẽ thay token cũ nếu tạo được token mới. Frontend có thể đếm ngược 60 giây trước khi cho gửi lại.
- Thiếu cấu hình SMTP hoặc URL reset trả **503** với `message: "Chưa cấu hình dịch vụ email đặt lại mật khẩu"`.
- Nếu gửi SMTP thất bại, backend hủy token chưa gửi, ghi lỗi chung phía server và vẫn trả thông báo chung. HTTP 200 không bảo đảm email đã được chuyển tới hộp thư.
- Link sử dụng `PASSWORD_RESET_URL` của backend, kèm query `user_id` và `forgot_password_token`, ví dụ `/reset-password?user_id=<id>&forgot_password_token=<token>`. Frontend cần tạo trang đọc hai query này.

### **POST /users/reset-password**

API công khai, không cần access/refresh token. `user_id` và `forgot_password_token` lấy từ link email; token reset là chuỗi ngẫu nhiên, không phải JWT để frontend decode.

Body:
```json
{  
  "user_id": "...",  
  "forgot_password_token": "...",  
  "password": "NewPassword123",  
  "confirm_password": "NewPassword123"  
}
```

Response:
```json
{ "message": "Đặt lại mật khẩu thành công" }
```

HTTP **200** khi thành công. Mật khẩu được thay bằng Bcrypt; token reset bị xóa, tokenVersion tăng và mọi phiên cũ bị thu hồi. API không cấp token đăng nhập mới: frontend đưa người dùng về đăng nhập.

- Token sai, sai user, hết hạn hoặc đã dùng trả **401**: `Token đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng`. Hiển thị nút yêu cầu link mới; không gọi API refresh để xử lý lỗi này.
- User ID sai định dạng, thiếu field hoặc mật khẩu/xác nhận không hợp lệ trả **422**.
- Hai lần gửi cùng token chỉ một lần có thể thành công.
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

Tìm kiếm và phân trang tài khoản Customer/Manager. Danh sách này không bao gồm Admin.

Query: `search` (tối đa 100 ký tự, tìm chuỗi trong email/username/phone, không phân biệt hoa thường), `role=Customer|Manager`, `status=Active|Locked`, `page` (mặc định 1, tối đa 1000000), `limit` (mặc định 20, tối đa 100). Ví dụ: `/users?role=Manager&status=Active&page=1&limit=20`.

Response HTTP **200**: `{ "message": "Lấy danh sách người dùng thành công", "result": { "items": [], "page": 1, "limit": 20, "total": 0 } }`. `total` là số tài khoản khớp bộ lọc, không phải số dòng của trang. Mỗi dòng chỉ gồm `_id`, `email`, `username`, `phone`, `role`, `account_status`, `created_at`; sắp xếp `created_at` và `_id` giảm dần. Không trả hồ sơ sức khỏe hay dữ liệu xác thực. Customer/Manager nhận 403; query sai nhận 422.

### **POST /users (Auth, Admin)**

Admin tạo tài khoản Customer hoặc Manager. Khác với `/users/register`, field `role` bắt buộc và không nhận `Admin`.

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

Không trả password hoặc token đăng nhập cho user mới. Backend ghi audit `UserCreated`; người vừa được tạo cần đăng nhập riêng. Tài khoản Admin được khởi tạo bằng seed, không qua API này.

Lỗi: 401 nếu phiên không hợp lệ; 403 nếu người gọi không phải Admin; 422 nếu validation không đạt (bao gồm role sai hoặc email/username đã tồn tại khi kiểm tra); service có thể trả 409 nếu phát hiện trùng email/username sau bước validation.

### **PATCH /users/:user_id/status (Auth, Admin)**

Admin khóa/mở tài khoản Customer/Manager. Backend chặn thay đổi trạng thái mọi tài khoản Admin, kể cả chính người gọi.

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

User không tồn tại trả 404; sửa tài khoản Admin trả 403; user_id/status/reason không hợp lệ ở validator trả 422.

### **PATCH /users/:user_id/role (Auth, Admin)**

Body: `{ "role": "Manager", "reason": "Phân công phụ trách báo cáo" }`. Chỉ đổi Customer ↔ Manager; `reason` bắt buộc, 1–500 ký tự sau khi trim. Không cho nâng thành Admin hoặc sửa role của bất kỳ tài khoản Admin nào, kể cả chính người gọi.

Response HTTP **200**: `{ "message": "Đã cập nhật vai trò tài khoản", "changed": true }`. Thay đổi role, tăng tokenVersion, thu hồi mọi phiên và ghi audit `RoleChanged` (quyền cũ/mới, người thực hiện, lý do) trong cùng transaction. Tài khoản đang Locked vẫn Locked. User cần đăng nhập lại để nhận role mới. Gửi lại cùng role trả `changed: false`, giữ phiên và không ghi audit lặp.

Lỗi: 401 nếu phiên không hợp lệ, 403 nếu không phải Admin hoặc đích là Admin, 404 nếu user không tồn tại, 422 nếu ID/role/reason sai.

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
Upload một file ảnh lên hệ thống (được lưu trữ trực tiếp trên Cloudinary). Dùng cho ảnh đại diện, ảnh món ăn hoặc ảnh đính kèm trong review.

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

## **4) Foods (/foods)**

### **GET /foods**

Query optional:

* page, limit  
* search  
* tags (CSV, ví dụ Vegan,LowCarb)  
* minPrice, maxPrice  
* minCalories, maxCalories  
* sortBy: createdAt | price | calories | name  
* order: asc | desc

**Phân quyền (Quan trọng):**

* Nếu Header chứa Token của **Admin**: Trả về TOÀN BỘ thực đơn.  
* Nếu không có token, token đã hết hạn/thu hồi, tài khoản bị khóa hoặc user là **Customer/Manager**: Chỉ trả về món đang bán (isActive: true). Quyền Admin chỉ được cấp sau khi kiểm tra JWT + phiên + role/tokenVersion hiện tại trong DB. Lọc món còn hàng và cảnh báo dị ứng cá nhân còn cần hoàn thiện theo US-13.

**Giới hạn hiện tại:** `GET /foods` là API public, tự kiểm tra JWT và role trong DB, chưa gọi `validateSession` để kiểm tra phiên/tokenVersion/trạng thái tài khoản. Token sai hoặc hết hạn bị bỏ qua và request dùng quyền khách; token Admin đã logout nhưng JWT còn hạn vẫn có thể được nhận diện là Admin tại riêng endpoint này. Cần đồng bộ optional auth ở backend trong bước tiếp theo. Các API tạo/sửa/xóa món dùng middleware kiểm tra phiên đầy đủ.

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

Response: chi tiết food.

### **POST /foods (Auth, Admin)**

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

### **PATCH /foods/:food_id (Auth, Admin)**

Body (Tất cả các trường đều là optional, gửi trường nào cập nhật trường đó):
```json
{
  "name": "Chicken Salad Updated",
  "price": 85000,
  "stock": 15,
  "isActive": true
}
```

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

Xóa/Ẩn món ăn.

## **5) Cart (/cart) - Auth bắt buộc**

### **GET /cart**

DB chỉ lưu một giỏ/người. Response vẫn có `foodCart` và `comboCart` để hỗ trợ giao diện cũ; hai phần dùng cùng cartId, chỉ phần tương ứng chế độ đang chọn có món.

Response:
```json
{  
  "message": "Lấy giỏ hàng thành công",  
  "result": {  
    "foodCart": {  
      "cartId": "...",  
      "userId": "...",  
      "cartType": "FOOD",  
      "items": [],  
      "summary": {  
        "itemCount": 0,  
        "subtotal": 0,  
        "totalCalories": 0  
      }  
    },  
    "comboCart": {  
      "cartId": "...",  
      "userId": "...",  
      "cartType": "COMBO",  
      "items": [  
        {  
          "_id": "<cart_line_id>",
          "itemId": "...",  
          "deliveryDate": "2026-10-01",
          "mealSlot": "Lunch",
          "quantity": 1,  
          "itemName": "...",  
          "image": "...",  
          "unitPrice": 129000,  
          "unitCalories": 680,  
          "lineTotal": 129000,  
          "lineCalories": 680,  
          "availability": {  
            "isActive": true,  
            "inStock": true  
          }  
        }  
      ],  
      "summary": {  
        "itemCount": 1,  
        "subtotal": 129000,  
        "totalCalories": 680  
      }  
    }  
  }  
}
```

### **GET /cart/food**

Trả phần FOOD; rỗng nếu giỏ hiện tại đang ở chế độ COMBO.

### **GET /cart/combo**

Trả phần COMBO; rỗng nếu giỏ hiện tại đang ở chế độ FOOD.

### **POST /cart/items**

Body:
```json
{
  "itemId": "<food_id>",
  "quantity": 1,
  "cartType": "COMBO",
  "deliveryDate": "2026-10-01",
  "mealSlot": "Lunch"
}
```
* `cartType`: FOOD hoặc COMBO. Nếu không gửi, dùng chế độ hiện tại; giỏ mới mặc định FOOD.
* COMBO bắt buộc có `deliveryDate`. Có thể gửi `mealPlanId` và `mealPlanItemId` nếu món lấy từ thực đơn đã lưu.
* Cùng món nhưng khác ngày/bữa là các dòng khác nhau. Cần xóa giỏ hiện tại trước khi đổi chế độ nếu còn món.

### **PATCH /cart/items/:itemId**

Body:
```json
{ "quantity": 3 }
```

* quantity = 0 => backend xóa item khỏi giỏ.
* Tham số `itemId` trên URL nên gửi `_id` của **dòng giỏ**. Mã Food cũ chỉ được chấp nhận khi xác định đúng một dòng; nếu món nằm ở nhiều ngày/bữa thì trả lỗi yêu cầu dùng mã dòng.

### **DELETE /cart/items/:itemId**

### **DELETE /cart**

### **DELETE /cart/food**

### **DELETE /cart/combo**

### **POST /cart/refresh**

## **6) Orders (/orders) - Auth bắt buộc**

### **Enum**

* paymentMethod: COD | VNPay | MoMo  
* orderStatus: Pending | Cooking | Delivering | Completed | Cancelled  
* paymentStatus: Pending | Paid | Failed  
* packageType: ONE_DAY | WEEKLY_7D  
* cartType: FOOD | COMBO

### **POST /orders/quote (Customer)**

Chỉ Customer được gọi; Admin/Manager nhận 403.

Body:
```json
{  
  "deliveryAddress": "...",  
  "deliveryDate": "2026-04-10",  
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
* Nên gửi `deliveryDate` có giờ và múi giờ, ví dụ `2026-10-01T12:00:00+07:00`, để giữ giờ giao cố định.

Response chứa:

* cart  
* deliveries[]: date, scheduledAt, items[], status, statusHistory[], subtotal, shipping, waivedShippingFee
* pricing: subtotal, shippingFee, grandTotal, shippingBreakdowns[], totalCalories  
* delivery: address, schedule, daysCount, packageType, cartType
* payment.method

### **POST /orders (Customer)**

Body giống /orders/quote.

* Tạo order xong backend xóa các món trong giỏ đã checkout.
* Order trả `deliveries[].items[]`; mỗi item có `foodId`, `foodName`, `quantity`, `price`, `calories`, `nutrition` đã chốt lúc đặt. Không còn `order.items` hoặc `order.deliverySchedule`.
* `inventoryHold` hiện là `NotReserved`; việc giữ/trừ kho, xác thực IPN và tự hủy chưa được triển khai trong đợt đơn giản hóa schema. Enum schema có `Confirmed` và trạng thái hoàn tiền, nhưng API vận hành hiện vẫn dùng luồng trạng thái cũ bên dưới.

### **GET /orders**

Lấy đơn có `userId` bằng ID người đang đăng nhập, sắp xếp mới nhất trước, với mọi vai trò. **Endpoint này không tự chuyển sang danh sách toàn hệ thống khi người gọi là Admin.** Response HTTP 200 dạng `{ "message": "...", "result": [] }`.

### **GET /orders/all (Admin, Manager)**

Lấy toàn bộ đơn trên hệ thống, sắp xếp `createdAt` giảm dần. Response HTTP **200** dạng `{ "message": "Lấy danh sách tất cả đơn hàng thành công", "result": [] }`; Customer gọi trả 403. Hiện chưa có query lọc hoặc phân trang cho danh sách này.

Manager dùng endpoint này cho giao diện xem đơn, không được gọi API sửa trạng thái/thanh toán hay hủy đơn.

### **GET /orders/:orderId**

Lấy chi tiết order, response HTTP 200 dạng `{ "message": "...", "result": { ... } }`:

- Customer chỉ đọc đơn của mình; đơn không tồn tại hoặc thuộc người khác trả 404.
- Admin/Manager được đọc chi tiết mọi đơn.
- Chi tiết món đọc từ `result.deliveries[].items[]`.

### **PATCH /orders/:orderId/cancel**

* Customer chỉ hủy được khi Pending.  
* Admin được hủy rộng hơn, nhưng không hủy được Completed hoặc Cancelled.
* Manager không được hủy (403 ngay tại middleware). API hiện hủy toàn đơn/các kỳ giao chưa hoàn thành; chưa có endpoint hủy riêng từng ngày.

### **PATCH /orders/:orderId/status**

Body:
```json
{ "status": "Cooking" }
```

* Chỉ Admin.  
* Luồng hợp lệ: Pending -> Cooking -> Delivering -> Completed.

### **POST /orders/:orderId/payments/retry (Customer)**

Chỉ Customer, với đơn thuộc chính mình. Admin/Manager nhận 403. Endpoint hiện chưa tích hợp cổng thanh toán thực tế.

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
* Chỉ Admin.

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
  "orderId": "<completed_order_id>",
  "rating": 5,  
  "comment": "Rất ngon",  
  "images": ["https://..."]  
}
```

* Chỉ người có đơn Completed chứa món mới được đánh giá; mỗi đơn một đánh giá. Nên gửi `orderId` để chọn đúng lần mua.
* Body cũ `targetType: Food` + `targetId` vẫn được nhận; DB chỉ lưu `foodId` và `orderId`.
* Sau khi tạo/sửa/xóa, backend tính lại rating món từ những đánh giá đang hiển thị.

### **GET /reviews/:targetType/:targetId**

* targetType: Food

Response:
```json
{  
  "message": "Lấy danh sách đánh giá thành công",  
  "result": []  
}
```

### **PATCH /reviews/:review_id (Auth)**

Sửa đánh giá. Kích hoạt tự động tính lại Rating.

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

### **DELETE /reviews/:review_id (Auth, Admin hoặc Owner)**

Xóa đánh giá. Kích hoạt tự động tính lại Rating.

Response:
```json
{
  "message": "Xóa đánh giá thành công (Dành cho Admin)"
}
```

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

1. Chỉ xử lý refresh cho 401 từ request cần access token; loại trừ login, register, logout, logout-all, forgot-password, reset-password và refresh-token khỏi interceptor tự refresh. Lỗi 401 của reset có nghĩa link reset không hợp lệ.
2. Nếu nhiều request cùng nhận 401, chờ chung **một** request refresh đang chạy. Gửi boolean thật cho `remember_me` khi đăng nhập.
3. Khi refresh thành công, lưu đồng thời cặp token mới rồi thử lại request ban đầu tối đa một lần. Không tiếp tục dùng refresh token cũ.
4. Refresh trả 401 hoặc request đã thử lại vẫn trả 401: xóa trạng thái đăng nhập và chuyển về login. Lỗi mạng/5xx cần được hiển thị riêng, không tạo vòng lặp refresh.
5. Lỗi 403 là không đủ quyền; không refresh để thử vượt qua. Render trang không có quyền hoặc ẩn thao tác tương ứng.
6. Với logout, đợi tác vụ refresh đang chạy kết thúc rồi gửi refresh token mới nhất. Sau 200 hoặc 401, xóa trạng thái cục bộ. Nếu lỗi mạng, không báo rằng server đã thu hồi phiên; chỉ xóa cục bộ không bảo đảm thu hồi phía server.
7. Reset thành công: bỏ token cũ của tài khoản trên client và yêu cầu đăng nhập lại. Logout-all cũng kết thúc phiên đang dùng.

### **Quyền đã có cho màn hình quản trị/đơn hàng**

| Chức năng | Customer | Admin | Manager |
| --- | --- | --- | --- |
| Tạo Customer/Manager, tìm/lọc/phân trang user, khóa/mở, đổi role | Không | Có; không sửa tài khoản Admin | Không |
| Giỏ hàng, hồ sơ sức khỏe, thực đơn, tracking, tạo/sửa review | Có, dữ liệu của mình | Không | Không |
| CRUD món | Không | Có | Không |
| Quote/tạo đơn, retry thanh toán | Có, đơn của mình | Không | Không |
| Xem toàn bộ đơn qua `/orders/all` | Không | Có | Có, chỉ đọc |
| Xem chi tiết đơn | Đơn của mình | Mọi đơn | Mọi đơn |
| Hủy đơn | Đơn của mình, Pending | Trừ Completed/Cancelled | Không |
| Đổi trạng thái đơn/thanh toán | Không | Có | Không |
| Dashboard vận hành, nhật ký toàn hệ thống `/admin/*` | Không | Có | Không |
| Báo cáo tài chính/Excel Manager | Chưa có API | Chưa có API | Chưa có API |

Cart, Tracking, Health Profile, gợi ý thực đơn và tạo/sửa review đã được giới hạn Customer ở backend. `/users/me`, đăng xuất và upload dùng chung cho các vai trò có phiên hợp lệ. Danh mục món và danh sách review vẫn công khai. Customer chỉ được sửa review của mình; Admin được xóa review theo API hiện tại.

### **Form và dữ liệu đã đổi schema**

- Form đăng ký/tạo user/reset dùng chung quy tắc 8–50 ký tự, tối đa 72 byte UTF-8 và xác nhận khớp; không áp thêm quy tắc “password mạnh” chưa có trong backend. `days` gợi ý thực đơn chỉ nhận 1 hoặc 7.
- Trang reset đọc `user_id`/`forgot_password_token` từ query email, gọi `/users/reset-password`. Với link hết hạn/đã dùng, cho phép gửi link mới; không cần user đăng nhập trước.
- Gọi `/orders/quote` để hiển thị chi phí dự kiến trước khi tạo đơn. Dùng `deliveries[]` để render từng ngày và `deliveries[].items[]` cho món.
- Sau thêm/sửa/xóa giỏ, đồng bộ UI bằng response mới; dùng `_id` dòng giỏ khi cập nhật/xóa. Một Food có thể xuất hiện ở nhiều ngày/bữa.
- Không gửi `Food.details`, `Food.isCombo`, không đọc `order.items`/`order.deliverySchedule`. Tracking dùng ngày Việt Nam `YYYY-MM-DD`, không tự đổi thành ngày UTC.

## **11) Phần chưa triển khai hoặc cần đồng bộ tiếp**

- Frontend hiện vẫn cần cập nhật các trang/route/API PT cũ, guard vai trò, trang reset email và giao diện Admin tạo/khóa user.
- Backend chưa có báo cáo tài chính/Excel Manager, API liệt kê/xóa riêng phiên theo ID hay API đọc audit log. Có schema/service nội bộ không có nghĩa đã có endpoint public.
- Frontend quản lý user cần đọc `result.items` và `result.total`, gửi `reason` khi khóa/mở/đổi role. Dashboard Admin phải dùng `orders.byStatus`; response không còn `revenue`. Các trang frontend cũ chưa được chuyển trong đợt backend này.
- Checkout chưa hoàn thiện giữ/trừ kho bằng transaction, idempotency, xác thực IPN, job hết hạn và hoàn tiền. Không coi việc trả trạng thái Paid thủ công là xác nhận từ cổng thanh toán.
- Chưa có API hủy/đổi món/hoàn tiền riêng từng ngày của gói tuần. Recommendation/swap hiện chưa lưu MealPlan; các rule dinh dưỡng nâng cao còn cần triển khai.
- Reset email chỉ chạy thực tế sau khi cấu hình SMTP; `PASSWORD_RESET_URL` phải trỏ tới trang frontend đã có. Hướng dẫn DB/seed/email ở [auth-setup.md](auth-setup.md), giải thích 12 collection ở [database_schema.md](../../docs/database_schema.md).
