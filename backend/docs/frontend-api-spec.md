# **Frontend API Spec (E-commerce Backend)**

Tài liệu này tổng hợp API thực tế từ source code backend hiện tại, bao gồm các tính năng quản lý PT, Admin Dashboard, E-commerce (Food/Combo), Tracking và Upload.

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

Đăng ký Customer/PT.

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

* role: Customer | PT (mặc định Customer)  
* PT cần chờ duyệt, có thể không nhận token ngay.

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

Response (PT):
```json
{  
  "message": "Đăng ký thành công",  
  "result": {  
    "requires_approval": true,  
    "message": "Hồ sơ của bạn đã được ghi nhận..."  
  }  
}
```

### **POST /users/login**

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
- Admin hiện tại đang có 1 tài khoản là 
- username: admin@ecommerce.local - password: Admin123456

### **POST /users/logout (Auth)**

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
{  
  "access_token": "...",  
  "refresh_token": "..."  
}
```

### **POST /users/forgot-password**

Body:
```json
{ "email": "a@example.com" }
```
Response:
```json
{  
  "message": "Vui lòng kiểm tra email để đặt lại mật khẩu",  
  "forgot_password_token": "..."  
}
```

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

*(Lưu ý: Trường ptProfile.rating sẽ được Backend tự động cập nhật dựa trên các đánh giá của người dùng)*

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
    "healthProfile": {},  
    "ptProfile": {}  
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

### **PATCH /users/me/pt-profile (Auth, PT)**

*(Lưu ý: PT không thể tự sửa trường approvedByAdmin)*

Body:
```json
{  
  "experienceYears": 3,  
  "specialties": ["weight loss", "strength"],  
  "portfolioImages": ["https://..."]  
}
```

### **POST /users/me/pt-services/:service_id/register (Auth, Customer)**

*(Lưu ý: Mảng registeredPTServices sẽ lưu Object chứa tiến độ học (remainingSessions) thay vì chỉ lưu ID)*

Response:
```json
{  
  "message": "Đăng ký gói PT thành công",  
  "result": { "_id": "...", "title": "..." }  
}
```

### **GET /users/me/pt-services (Auth)**

Response:
```json
{  
  "message": "Lấy danh sách gói PT đã đăng ký thành công",  
  "result": {  
    "services": []  
  }  
}
```

### **GET /users (Auth, Admin)**

Lấy toàn bộ danh sách User, PT, Admin trên hệ thống.

### **PATCH /users/:user_id/approve-pt (Auth, Admin)**

Admin duyệt hồ sơ PT (Đổi account_status thành Active và cấp quyền approvedByAdmin: true).

Response:
```json
{ "message": "Duyệt tài khoản PT thành công" }
```

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

### **GET /users/recommendations/pts?limit=3 (Auth)**

* limit: 1..10

## 3) Upload Media (`/medias`)

### POST `/medias/upload-image` (Auth)
Upload một file ảnh lên hệ thống (được lưu trữ trực tiếp trên Cloudinary). Dùng cho ảnh đại diện, ảnh món ăn, portfolio của PT, hoặc ảnh đính kèm trong review.

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
    "https://res.cloudinary.com/dtxhrmafz/image/upload/v1775898185/pt-ecommerce/hpdsdddl4dnqe9vlnznl.jpg"
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
* isCombo: true | false  
* sortBy: createdAt | price | calories | name  
* order: asc | desc

**Phân quyền (Quan trọng):**

* Nếu Header chứa Token của **Admin**: Trả về TOÀN BỘ thực đơn.  
* Nếu Không có Token hoặc Token của **Customer**: Chỉ trả về món đang bán (isActive: true và stock > 0).

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
  "details": "Combo ức gà + nước ép",  
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
  "isCombo": false  
}
```
* Nếu không truyền isCombo thì backend mặc định false.

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

Trả về cả 2 giỏ: foodCart và comboCart.

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
          "itemId": "...",  
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

Trả riêng giỏ FOOD.

### **GET /cart/combo**

Trả riêng giỏ COMBO.

### **POST /cart/items**

Body:
```json
{ "itemId": "<food_id>", "quantity": 1 }
```
* Backend tự xác định giỏ đích theo foods.isCombo:  
  * isCombo = false -> vào giỏ FOOD  
  * isCombo = true -> vào giỏ COMBO

### **PATCH /cart/items/:itemId**

Body:
```json
{ "quantity": 3 }
```

* quantity = 0 => backend xóa item khỏi giỏ.

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

Response chứa:

* cart  
* pricing: subtotal, shippingFee, grandTotal, shippingBreakdowns[], totalCalories  
* delivery: address, schedule, daysCount, packageType, cartType
* payment.method

### **POST /orders**

Body giống /orders/quote.

* Tạo order xong backend **clear đúng giỏ đã checkout** (FOOD hoặc COMBO).

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

## **7) PT Services (/pt)**

### **GET /pt/services**

Query: page, limit

Response:
```json
{  
  "message": "Lấy danh sách gói PT thành công",  
  "result": {  
    "services": [],  
    "pagination": { "page": 1, "limit": 10, "total": 0, "total_pages": 0 }  
  }  
}
```

### **GET /pt/services/:service_id**

### **POST /pt/services (Auth)**

Body:
```json
{  
  "title": "Gói giảm mỡ 1 tháng",  
  "description": "...",  
  "price": 1200000,  
  "sessions": 12,  
  "durationDays": 30,  
  "isActive": true,  
  "ptId": "..."  
}
```

* Nếu user role PT: ptId bị bỏ qua, lấy từ token.  
* Nếu role Admin: có thể truyền ptId để tạo cho PT khác.

### **GET /pt/clients (Auth, PT)**

PT lấy danh sách học viên đang đăng ký gói tập của mình.

Response: Trả về mảng thông tin user (đã loại bỏ field nhạy cảm), kèm theo mảng registeredPTServices chứa Object tiến độ học.

### **PATCH /pt/clients/:client_id/services/:service_id/check-in (Auth, PT)**

PT Check-in trừ đi 1 buổi tập. Backend sẽ báo lỗi nếu remainingSessions = 0.

Response:
```json
{ "message": "Check-in thành công. Học viên còn 11 buổi." }
```

### **GET /pt/debug/user-by-username?username=...**

Route debug nội bộ.

## **8) Admin Dashboard (/admin)**

### **GET /admin/dashboard-stats (Auth, Admin)**

Lấy các chỉ số thống kê tổng quan cho trang chủ Admin Panel.

Response:
```json
{  
  "message": "Lấy thống kê Dashboard thành công",  
  "result": {  
    "users": {  
      "customers": 9,  
      "pts": 11  
    },  
    "products": {  
      "foods": 50,  
      "ptServices": 10  
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

## **9 Tracking (/tracking) - Auth bắt buộc**

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
    { "date": "2026-04-01T00:00:00.000Z", "weightKg": 73 },  
    { "date": "2026-04-07T00:00:00.000Z", "weightKg": 72.5 }  
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
    "date": "2026-04-08T00:00:00.000Z",  
    "caloriesConsumed": 920,  
    "entries": []  
  }  
}
```

* Khi order chuyển Completed, backend tự ghi calories theo từng ngày trong deliverySchedule.

## **10) Reviews (/reviews)**

### **POST /reviews (Auth)**

Body:
```json
{  
  "targetType": "Food",  
  "targetId": "...",  
  "rating": 5,  
  "comment": "Rất ngon",  
  "images": ["https://..."]  
}
```

*(Lưu ý: Sau khi tạo mới, Backend sẽ TỰ ĐỘNG tính lại Average Rating và cập nhật vào Profile của đối tượng được đánh giá).*

### **GET /reviews/:targetType/:targetId**

* targetType: Food | PT

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

## **11) Gợi ý tích hợp frontend (quan trọng)**

1. **Chuẩn hóa client theo envelope:**  
   * Ưu tiên đọc response.result, fallback đọc root object cho vài endpoint auth.  
2. **Interceptor xử lý token:**  
   * Khi 401, gọi /users/refresh-token, cập nhật access token, retry request.  
3. **Form validation phía frontend nên bám các rule backend:**  
   * Password mạnh, days chỉ 1|7, limit PT 1..10, v.v.  
4. **Đơn hàng:**  
   * Luôn gọi /orders/quote trước để hiển thị chi phí dự kiến.  
5. **Cart:**  
   * Sau add/update/remove nên dùng response cart mới trả về để sync UI.  
6. **Tiến độ tập luyện (PT Dashboard)**   
   * Khi PT gọi API Check-in thành công, Frontend nên trừ trực tiếp số remainingSessions trên UI State thay vì gọi lại hàm GET để giảm tải server.  
7. **Hiển thị Doanh thu Admin** 
   * Cấu trúc revenue.breakdown sinh ra để vẽ trực tiếp biểu đồ tròn (Pie Chart). overall và thisMonth dùng cho thẻ thông kê nhanh (Stat Cards).