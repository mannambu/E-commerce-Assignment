# **Frontend API Spec (E-commerce Backend)**

Tài liệu này tổng hợp API thực tế từ source code backend hiện tại, bao gồm Admin Dashboard, E-commerce (Food/Combo), Tracking và Upload.

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

* **Business lỗi**: HTTP 400 | 401 | 403 | 404
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

Body có refresh token là đủ; access token có thể đã hết hạn. Thu hồi cả access và refresh của phiên. `POST /users/logout-all` cần Bearer access token, thu hồi mọi phiên.

Body:
```json
{ "refresh_token": "..." }
```

Response:
```json
{ "message": "Đăng xuất thành công" }
```

### **POST /users/refresh-token**

Body:
```json
{ "refresh_token": "..." }
```

Response:
```json
{ "access_token": "...", "refresh_token": "..." }
```
Lưu cả hai token mới; refresh token cũ không dùng lại được. Reset mật khẩu thành công thu hồi mọi phiên.

### **POST /users/forgot-password**

Body:
```json
{ "email": "a@example.com" }
```
Response chỉ có `message`, không trả token. Liên kết được gửi qua email SMTP, hết hạn sau 15 phút và chỉ dùng một lần. Xem [auth-setup.md](auth-setup.md) để cấu hình và test.

### **POST /users/reset-password**

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
  "date_of_birth": "2003-01-01"  
}
```

### **GET /users (Auth, Admin)**

Lấy danh sách tài khoản Customer, Admin và Manager trên hệ thống.

### **PATCH /users/:user_id/status (Auth, Admin)**

Admin khóa/mở khóa tài khoản bất kỳ.

Body:
```json
{ "status": "Locked" } // hoặc "Active"
```

### **POST /users/health-profile (Auth)**

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

### **GET /users/health-metrics (Auth)**

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

### **POST /users/recommendations/meals (Auth)**

Body:
```json
{ "days": 1 }
```

* days: chỉ nhận 1 hoặc 7

### **POST /users/recommendations/meals/swap (Auth)**

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
* Nếu Không có Token hoặc Token của **Customer**: Chỉ trả về món đang bán (isActive: true). Lọc món còn hàng và cảnh báo dị ứng cá nhân còn cần hoàn thiện theo US-13.

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

### **POST /orders/quote**

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

### **POST /orders**

Body giống /orders/quote.

* Tạo order xong backend xóa các món trong giỏ đã checkout.
* Order trả `deliveries[].items[]`; mỗi item có `foodId`, `foodName`, `quantity`, `price`, `calories`, `nutrition` đã chốt lúc đặt. Không còn `order.items` hoặc `order.deliverySchedule`.
* `inventoryHold` hiện là `NotReserved`; việc giữ/trừ kho, xác thực IPN và tự hủy chưa được triển khai trong đợt đơn giản hóa schema. Enum schema có `Confirmed` và trạng thái hoàn tiền, nhưng API vận hành hiện vẫn dùng luồng trạng thái cũ bên dưới.

### **GET /orders**

**Phân quyền (Quan trọng):**

* Nếu là Customer: Lấy danh sách order của chính mình.  
* Nếu là **Admin**: Lấy TOÀN BỘ danh sách order trên hệ thống.

### **GET /orders/:orderId**

Lấy chi tiết order.

### **PATCH /orders/:orderId/cancel**

* Customer chỉ hủy được khi Pending.  
* Admin được hủy rộng hơn, nhưng không hủy được Completed hoặc Cancelled.

### **PATCH /orders/:orderId/status**

Body:
```json
{ "status": "Cooking" }
```

* Chỉ Admin.  
* Luồng hợp lệ: Pending -> Cooking -> Delivering -> Completed.

### **POST /orders/:orderId/payments/retry**

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

Lấy các chỉ số thống kê tổng quan cho trang chủ Admin Panel.

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
    "revenue": {  
      "overall": {  
        "totalAmount": 6187000,  
        "completedOrders": 6  
      },  
      "thisMonth": {  
        "totalAmount": 6187000,  
        "completedOrders": 6  
      },  
      "breakdown": {  
        "FOOD_ONE_DAY": { "revenue": 1000000, "orders": 2 },  
        "COMBO_WEEKLY": { "revenue": 5187000, "orders": 4 },  
        "OTHER": { "revenue": 0, "orders": 0 }  
      }  
    }  
  }  
}
```

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

1. **Chuẩn hóa client theo envelope:**  
   * Ưu tiên đọc response.result, fallback đọc root object cho vài endpoint auth.  
2. **Interceptor xử lý token:**  
   * Khi 401, gọi /users/refresh-token, cập nhật access token, retry request.  
3. **Form validation phía frontend nên bám các rule backend:**  
   * Password mạnh, days chỉ 1|7, v.v.
4. **Đơn hàng:**  
   * Luôn gọi /orders/quote trước để hiển thị chi phí dự kiến.  
5. **Cart:**  
   * Sau add/update/remove nên dùng response cart mới trả về để sync UI.  
6. **Hiển thị Doanh thu Admin**
   * Cấu trúc revenue.breakdown sinh ra để vẽ trực tiếp biểu đồ tròn (Pie Chart). overall và thisMonth dùng cho thẻ thông kê nhanh (Stat Cards).
