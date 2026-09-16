1. Health Profile Intake (Onboarding + cập nhật linh hoạt)
   POST /users/health-profile (có auth)
   Lưu/cập nhật hồ sơ sức khỏe
   Tự động tính lại:
   bmr
   tdee
   targetCalories
   macroDistribution (gram Protein/Carb/Fat)
   Chuẩn hóa allergies thành danh sách rule cấm

2. Metrics Dashboard
   GET /users/health-metrics (có auth)
   Trả về health profile + các chỉ số đã tính (BMR, TDEE, target calories, macros)

3. Recommendation Engine
   POST /users/recommendations/meals (có auth)
   Body: { days?: 1 | 7 }
   Trả thực đơn theo slot: Breakfast, Lunch, Dinner, Snack
   Tổng calories mỗi ngày tiệm cận targetCalories
   Lọc cứng theo allergies/kiêng kỵ (không trả món vi phạm)
   Nếu có rule vegan thì chỉ lấy món có tag vegan
   POST /users/recommendations/meals/swap (có auth)
   Body: { 
    current_food_id: string, target_calories?: number }
   Trả món thay thế gần calories mục tiêu, vẫn tôn trọng allergy rules
   GET /users/recommendations/pts?limit=3 (có auth)
   Gợi ý PT theo mục tiêu sức khỏe (LoseFat/GainMuscle/MaintainWeight)
   Ưu tiên PT có specialty phù hợp + rating cao
