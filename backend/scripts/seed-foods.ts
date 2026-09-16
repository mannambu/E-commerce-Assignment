import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import Food from '../src/models/schemas/Food.schema'
config()

const username = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const dbname = process.env.DB_NAME

if (!username || !password) {
  throw new Error('Missing DB_USERNAME or DB_PASSWORD in the .env file')
}

const uri = `mongodb+srv://${username}:${password}@studymongodbbasic.nvb8bql.mongodb.net/?appName=StudyMongoDBBasic`

const SAMPLE_FOODS: Food[] = [
  new Food({
    name: 'Grilled Chicken Breast with Broccoli',
    description: 'Tender grilled chicken breast served with steamed broccoli and sweet potato',
    images: ['chicken-broccoli.jpg'],
    price: 89000,
    calories: 380,
    nutrition: { protein: 45, carb: 25, fat: 8 },
    ingredients: [
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Broccoli', allergyTags: [] },
      { name: 'Sweet Potato', allergyTags: [] }
    ],
    tags: ['HighProtein', 'LowFat'],
    stock: 50,
    isActive: true
  }),
  new Food({
    name: 'Salmon Fillet with Asparagus',
    description: 'Fresh salmon fillet grilled with asparagus and lemon sauce',
    images: ['salmon-asparagus.jpg'],
    price: 125000,
    calories: 420,
    nutrition: { protein: 40, carb: 15, fat: 20 },
    ingredients: [
      { name: 'Salmon', allergyTags: ['Shellfish'] },
      { name: 'Asparagus', allergyTags: [] },
      { name: 'Lemon', allergyTags: [] }
    ],
    tags: ['HighProtein', 'Omega3'],
    stock: 30,
    isActive: true
  }),
  new Food({
    name: 'Turkey Meatballs with Quinoa',
    description: 'Homemade turkey meatballs served over fluffy quinoa and roasted vegetables',
    images: ['turkey-meatballs.jpg'],
    price: 95000,
    calories: 390,
    nutrition: { protein: 42, carb: 35, fat: 10 },
    ingredients: [
      { name: 'Ground Turkey', allergyTags: [] },
      { name: 'Quinoa', allergyTags: [] },
      { name: 'Carrot', allergyTags: [] }
    ],
    tags: ['HighProtein', 'GlutenFree'],
    stock: 45,
    isActive: true
  }),
  new Food({
    name: 'Tofu Stir-Fry with Rice',
    description: 'Crispy fried tofu with mixed vegetables and jasmine rice',
    images: ['tofu-stir-fry.jpg'],
    price: 45000,
    calories: 420,
    nutrition: { protein: 18, carb: 55, fat: 12 },
    ingredients: [
      { name: 'Tofu', allergyTags: [] },
      { name: 'Broccoli', allergyTags: [] },
      { name: 'Jasmine Rice', allergyTags: [] }
    ],
    tags: ['Vegan', 'ContainsSoy'],
    stock: 60,
    isActive: true
  }),
  new Food({
    name: 'Brown Rice Bowl with Grilled Fish',
    description: 'Grilled sea bass fillet with brown rice and steamed vegetables',
    images: ['fish-bowl.jpg'],
    price: 78000,
    calories: 410,
    nutrition: { protein: 38, carb: 45, fat: 10 },
    ingredients: [
      { name: 'Sea Bass', allergyTags: ['Shellfish'] },
      { name: 'Brown Rice', allergyTags: [] },
      { name: 'Zucchini', allergyTags: [] }
    ],
    tags: ['HighProtein'],
    stock: 40,
    isActive: true
  }),
  new Food({
    name: 'Chicken Fried Rice with Egg',
    description: 'Traditional fried rice with chicken, egg, peas and carrots',
    images: ['chicken-fried-rice.jpg'],
    price: 55000,
    calories: 385,
    nutrition: { protein: 28, carb: 48, fat: 10 },
    ingredients: [
      { name: 'Chicken', allergyTags: [] },
      { name: 'Egg', allergyTags: ['Egg'] },
      { name: 'Rice', allergyTags: [] }
    ],
    tags: [],
    stock: 70,
    isActive: true
  }),
  new Food({
    name: 'Green Salad with Grilled Chicken',
    description: 'Mixed greens with cherry tomato, cucumber, and sliced grilled chicken',
    images: ['salad-chicken.jpg'],
    price: 65000,
    calories: 280,
    nutrition: { protein: 32, carb: 18, fat: 8 },
    ingredients: [
      { name: 'Mixed Greens', allergyTags: [] },
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Tomato', allergyTags: [] }
    ],
    tags: ['LowCalorie', 'GlutenFree'],
    stock: 55,
    isActive: true
  }),
  new Food({
    name: 'Vegetable Soup with Tofu',
    description: 'Creamy vegetable soup with soft tofu blocks and herbs',
    images: ['veg-soup.jpg'],
    price: 35000,
    calories: 185,
    nutrition: { protein: 12, carb: 22, fat: 5 },
    ingredients: [
      { name: 'Tofu', allergyTags: [] },
      { name: 'Carrot', allergyTags: [] },
      { name: 'Celery', allergyTags: [] }
    ],
    tags: ['Vegan', 'LowCalorie'],
    stock: 80,
    isActive: true
  }),
  new Food({
    name: 'Steamed Shrimp with Vegetables',
    description: 'Fresh steamed shrimp with broccoli, carrots, and light garlic sauce',
    images: ['shrimp-veg.jpg'],
    price: 110000,
    calories: 220,
    nutrition: { protein: 28, carb: 12, fat: 7 },
    ingredients: [
      { name: 'Shrimp', allergyTags: ['Shellfish'] },
      { name: 'Broccoli', allergyTags: [] },
      { name: 'Garlic', allergyTags: [] }
    ],
    tags: ['LowCalorie', 'HighProtein'],
    stock: 35,
    isActive: true
  }),
  new Food({
    name: 'Buddha Bowl - Vegan',
    description: 'Quinoa, roasted vegetables, chickpeas, avocado, and tahini dressing',
    images: ['buddha-bowl.jpg'],
    price: 68000,
    calories: 410,
    nutrition: { protein: 16, carb: 52, fat: 15 },
    ingredients: [
      { name: 'Quinoa', allergyTags: [] },
      { name: 'Chickpeas', allergyTags: [] },
      { name: 'Avocado', allergyTags: [] }
    ],
    tags: ['Vegan', 'GlutenFree'],
    stock: 40,
    isActive: true
  }),
  new Food({
    name: 'Vegan Poke Bowl',
    description: 'Marinated tofu, sushi rice, edamame, cucumber, and sriracha mayo',
    images: ['vegan-poke.jpg'],
    price: 75000,
    calories: 390,
    nutrition: { protein: 15, carb: 58, fat: 10 },
    ingredients: [
      { name: 'Tofu', allergyTags: [] },
      { name: 'Sushi Rice', allergyTags: [] },
      { name: 'Edamame', allergyTags: [] }
    ],
    tags: ['Vegan', 'ContainsSoy'],
    stock: 35,
    isActive: true
  }),
  new Food({
    name: 'Lentil & Vegetable Curry',
    description: 'Spiced lentil curry with coconut milk, served with brown rice',
    images: ['lentil-curry.jpg'],
    price: 52000,
    calories: 450,
    nutrition: { protein: 18, carb: 62, fat: 12 },
    ingredients: [
      { name: 'Red Lentils', allergyTags: [] },
      { name: 'Coconut Milk', allergyTags: [] },
      { name: 'Brown Rice', allergyTags: [] }
    ],
    tags: ['Vegan', 'Spicy'],
    stock: 50,
    isActive: true
  }),
  new Food({
    name: 'Gluten-Free Pasta with Marinara',
    description: 'Gluten-free pasta with homemade tomato marinara sauce and basil',
    images: ['gf-pasta.jpg'],
    price: 62000,
    calories: 340,
    nutrition: { protein: 12, carb: 58, fat: 6 },
    ingredients: [
      { name: 'Gluten-Free Pasta', allergyTags: [] },
      { name: 'Tomato', allergyTags: [] },
      { name: 'Basil', allergyTags: [] }
    ],
    tags: ['GlutenFree', 'Vegan'],
    stock: 45,
    isActive: true
  }),
  new Food({
    name: 'Egg White Omelet with Spinach',
    description: 'Fluffy egg white omelet with fresh spinach, mushrooms, and cheese',
    images: ['egg-omelet.jpg'],
    price: 48000,
    calories: 210,
    nutrition: { protein: 28, carb: 8, fat: 6 },
    ingredients: [
      { name: 'Egg', allergyTags: ['Egg'] },
      { name: 'Spinach', allergyTags: [] },
      { name: 'Cheese', allergyTags: [] }
    ],
    tags: ['HighProtein', 'LowCalorie', 'GlutenFree'],
    stock: 60,
    isActive: true
  }),
  new Food({
    name: 'Burger with Fries',
    description: 'Beef burger with lettuce, tomato, and crispy fries',
    images: ['burger-fries.jpg'],
    price: 85000,
    calories: 680,
    nutrition: { protein: 32, carb: 72, fat: 28 },
    ingredients: [
      { name: 'Beef', allergyTags: [] },
      { name: 'Wheat Bun', allergyTags: ['Gluten'] },
      { name: 'Potato', allergyTags: [] }
    ],
    tags: ['ContainsGluten'],
    stock: 40,
    isActive: true
  }),
  new Food({
    name: 'Pizza - Margherita',
    description: 'Classic pizza with tomato sauce, mozzarella, and fresh basil',
    images: ['pizza.jpg'],
    price: 95000,
    calories: 720,
    nutrition: { protein: 28, carb: 85, fat: 30 },
    ingredients: [
      { name: 'Wheat Flour', allergyTags: ['Gluten'] },
      { name: 'Mozzarella', allergyTags: [] },
      { name: 'Tomato', allergyTags: [] }
    ],
    tags: ['ContainsGluten', 'ContainsDairy'],
    stock: 35,
    isActive: true
  }),
  new Food({
    name: 'Ức Gà Sốt Tiêu Đen + Cơm Gạo Lứt',
    description: 'Ức gà áp chảo sốt tiêu đen dùng kèm cơm gạo lứt và rau củ hấp',
    details: 'Bữa ăn giàu đạm, ít chất béo, phù hợp cho mục tiêu giảm mỡ và giữ cơ.',
    images: ['uc-ga-sot-tieu-den.jpg'],
    price: 92000,
    calories: 430,
    nutrition: { protein: 42, carb: 44, fat: 10 },
    ingredients: [
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Brown Rice', allergyTags: [] },
      { name: 'Bell Pepper', allergyTags: [] }
    ],
    tags: ['HighProtein', 'Balanced'],
    stock: 50,
    isActive: true
  }),
  new Food({
    name: 'Cá Hồi Áp Chảo + Khoai Lang Nướng',
    description: 'Cá hồi áp chảo vừa chín tới ăn kèm khoai lang nướng và salad xanh',
    details: 'Giàu omega-3 và chất béo tốt, hỗ trợ tim mạch và phục hồi cơ bắp.',
    images: ['ca-hoi-khoai-lang.jpg'],
    price: 129000,
    calories: 465,
    nutrition: { protein: 36, carb: 34, fat: 20 },
    ingredients: [
      { name: 'Salmon', allergyTags: ['Fish'] },
      { name: 'Sweet Potato', allergyTags: [] },
      { name: 'Lettuce', allergyTags: [] }
    ],
    tags: ['Omega3', 'HighProtein'],
    stock: 35,
    isActive: true
  }),
  new Food({
    name: 'Bò Xào Bông Cải Xanh',
    description: 'Thịt bò nạc xào nhanh với bông cải xanh và cà rốt',
    details: 'Bò nạc mềm, ít dầu, giữ độ giòn tự nhiên của rau củ.',
    images: ['bo-xao-bong-cai.jpg'],
    price: 99000,
    calories: 410,
    nutrition: { protein: 35, carb: 22, fat: 18 },
    ingredients: [
      { name: 'Lean Beef', allergyTags: [] },
      { name: 'Broccoli', allergyTags: [] },
      { name: 'Carrot', allergyTags: [] }
    ],
    tags: ['HighProtein', 'LowCarb'],
    stock: 45,
    isActive: true
  }),
  new Food({
    name: 'Mì Ý Nguyên Cám Sốt Cà Chua Gà Xé',
    description: 'Mì Ý nguyên cám với sốt cà chua tự nấu và gà xé',
    details: 'Nguồn tinh bột chậm và đạm nạc, phù hợp cho bữa trưa năng lượng ổn định.',
    images: ['my-y-nguyen-cam-ga-xe.jpg'],
    price: 86000,
    calories: 445,
    nutrition: { protein: 31, carb: 56, fat: 9 },
    ingredients: [
      { name: 'Whole Wheat Pasta', allergyTags: ['Gluten'] },
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Tomato', allergyTags: [] }
    ],
    tags: ['Balanced'],
    stock: 40,
    isActive: true
  }),
  new Food({
    name: 'Tôm Nướng Chanh Dây + Salad Quinoa',
    description: 'Tôm nướng sốt chanh dây ăn cùng salad quinoa rau củ',
    details: 'Món ăn tươi mát, giàu protein và khoáng chất.',
    images: ['tom-nuong-chanh-day.jpg'],
    price: 118000,
    calories: 395,
    nutrition: { protein: 33, carb: 36, fat: 11 },
    ingredients: [
      { name: 'Shrimp', allergyTags: ['Shellfish'] },
      { name: 'Quinoa', allergyTags: [] },
      { name: 'Mixed Greens', allergyTags: [] }
    ],
    tags: ['HighProtein', 'GlutenFree'],
    stock: 38,
    isActive: true
  }),
  new Food({
    name: 'Đậu Hũ Non Sốt Nấm + Cơm Lứt',
    description: 'Đậu hũ non sốt nấm đông cô, ăn cùng cơm lứt dẻo',
    details: 'Lựa chọn thuần chay nhẹ bụng, đạm thực vật cân đối.',
    images: ['dau-hu-sot-nam.jpg'],
    price: 69000,
    calories: 360,
    nutrition: { protein: 18, carb: 48, fat: 10 },
    ingredients: [
      { name: 'Tofu', allergyTags: ['Soy'] },
      { name: 'Shiitake Mushroom', allergyTags: [] },
      { name: 'Brown Rice', allergyTags: [] }
    ],
    tags: ['Vegan', 'GlutenFree'],
    stock: 52,
    isActive: true
  }),
  new Food({
    name: 'Salad Ức Vịt Cam Tươi',
    description: 'Ức vịt áp chảo thái lát dùng cùng xà lách, cam tươi và hạt bí',
    details: 'Hương vị thanh nhẹ, giàu vi chất và chất béo tốt.',
    images: ['salad-uc-vit-cam.jpg'],
    price: 112000,
    calories: 375,
    nutrition: { protein: 29, carb: 20, fat: 19 },
    ingredients: [
      { name: 'Duck Breast', allergyTags: [] },
      { name: 'Orange', allergyTags: [] },
      { name: 'Pumpkin Seeds', allergyTags: [] }
    ],
    tags: ['LowCarb', 'HighProtein'],
    stock: 30,
    isActive: true
  }),
  new Food({
    name: 'Bún Gạo Lứt Gà Xé Rau Củ',
    description: 'Bún gạo lứt ăn kèm gà xé, dưa leo, cà rốt và sốt mè rang nhẹ',
    details: 'Món ăn ít dầu, dễ tiêu hoá, phù hợp ăn trưa văn phòng.',
    images: ['bun-gao-lut-ga-xe.jpg'],
    price: 79000,
    calories: 405,
    nutrition: { protein: 28, carb: 52, fat: 8 },
    ingredients: [
      { name: 'Brown Rice Vermicelli', allergyTags: [] },
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Sesame', allergyTags: ['Sesame'] }
    ],
    tags: ['Balanced'],
    stock: 46,
    isActive: true
  }),
  new Food({
    name: 'Cơm Cuộn Rong Biển Cá Ngừ',
    description: 'Cơm cuộn rong biển cá ngừ, bơ và dưa leo',
    details: 'Phần ăn tiện lợi, giàu đạm và chất béo không bão hoà.',
    images: ['com-cuon-ca-ngu.jpg'],
    price: 84000,
    calories: 390,
    nutrition: { protein: 24, carb: 45, fat: 12 },
    ingredients: [
      { name: 'Tuna', allergyTags: ['Fish'] },
      { name: 'Seaweed', allergyTags: [] },
      { name: 'Avocado', allergyTags: [] }
    ],
    tags: ['Balanced'],
    stock: 42,
    isActive: true
  }),
  new Food({
    name: 'Yến Mạch Qua Đêm Chuối Hạt Chia',
    description: 'Yến mạch ngâm sữa hạnh nhân qua đêm cùng chuối và hạt chia',
    details: 'Bữa sáng nhanh gọn, nhiều chất xơ và no lâu.',
    images: ['overnight-oats-chia.jpg'],
    price: 52000,
    calories: 315,
    nutrition: { protein: 11, carb: 46, fat: 9 },
    ingredients: [
      { name: 'Oats', allergyTags: [] },
      { name: 'Banana', allergyTags: [] },
      { name: 'Chia Seeds', allergyTags: [] }
    ],
    tags: ['Vegetarian', 'HighFiber'],
    stock: 65,
    isActive: true
  }),
  new Food({
    name: 'Gói FULL',
    description: 'Gói 3 bữa sáng - trưa - tối giao tận nơi từ thứ 2 đến thứ 6.',
    details:
      'Gói 3 bữa SÁNG - TRƯA - TỐI\n\n- Sử dụng thực đơn 3 bữa/ngày tại trang fitfood.vn/menu.\n\n- Giao 03 phần ăn tận nơi mỗi ngày, từ thứ 2 đến thứ 6.\n\n- Calories dao động từ 1300 - 1500 Kcal phù hợp với thể trạng người Châu Á\n\n- Kèm tinh bột phức, ít đường, đảm bảo ko bột ngọt, nhiều rau củ và chất đạm\n\n* Thích hợp cho người ăn kiêng bận rộn hoặc theo đuổi chế độ ăn lâu dài',
    images: ['combo-goi-full.jpg'],
    price: 825000,
    calories: 1400,
    nutrition: { protein: 100, carb: 150, fat: 42 },
    ingredients: [
      { name: 'Lean Protein Mix', allergyTags: [] },
      { name: 'Complex Carbohydrates', allergyTags: [] },
      { name: 'Fresh Vegetables', allergyTags: [] }
    ],
    tags: ['Combo', 'MealPlan', 'FullDay'],
    stock: 120,
    isActive: true,
    isCombo: true
  }),
  new Food({
    name: 'Gói Cân Bằng 2 Bữa',
    description: 'Combo 2 bữa/ngày (trưa + tối) dành cho dân văn phòng.',
    details:
      'Combo linh hoạt gồm 2 bữa chính mỗi ngày, giao từ thứ 2 đến thứ 6. Calories khoảng 900 - 1100 Kcal/ngày, phù hợp duy trì vóc dáng và năng lượng làm việc.',
    images: ['combo-can-bang-2-bua.jpg'],
    price: 595000,
    calories: 1000,
    nutrition: { protein: 72, carb: 110, fat: 28 },
    ingredients: [
      { name: 'Chicken/Fish Rotation', allergyTags: [] },
      { name: 'Brown Rice/Sweet Potato', allergyTags: [] },
      { name: 'Seasonal Vegetables', allergyTags: [] }
    ],
    tags: ['Combo', 'MealPlan', 'Office'],
    stock: 140,
    isActive: true,
    isCombo: true
  }),
  new Food({
    name: 'Gói Lean Cut',
    description: 'Combo kiểm soát calories, ưu tiên đạm nạc và rau xanh.',
    details: 'Thiết kế cho người giảm mỡ: 2 bữa chính + 1 snack healthy/ngày. Tổng năng lượng 800 - 1000 Kcal/ngày.',
    images: ['combo-lean-cut.jpg'],
    price: 655000,
    calories: 920,
    nutrition: { protein: 88, carb: 85, fat: 24 },
    ingredients: [
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Green Vegetables', allergyTags: [] },
      { name: 'Nuts & Seeds', allergyTags: ['TreeNuts'] }
    ],
    tags: ['Combo', 'MealPlan', 'LowCalorie'],
    stock: 95,
    isActive: true,
    isCombo: true
  }),
  new Food({
    name: 'Gói Tăng Cơ Protein+',
    description: 'Combo giàu đạm cho người tập gym tăng cơ.',
    details:
      '3 bữa/ngày với protein cao từ 120 - 140g, bổ sung tinh bột phức và rau xanh, phù hợp giai đoạn tăng cơ sạch.',
    images: ['combo-tang-co-protein-plus.jpg'],
    price: 875000,
    calories: 1650,
    nutrition: { protein: 130, carb: 170, fat: 45 },
    ingredients: [
      { name: 'Chicken/Beef/Fish Rotation', allergyTags: [] },
      { name: 'Complex Carbs', allergyTags: [] },
      { name: 'Greens', allergyTags: [] }
    ],
    tags: ['Combo', 'MealPlan', 'HighProtein'],
    stock: 90,
    isActive: true,
    isCombo: true
  }),
  new Food({
    name: 'Gói Eat Clean Gia Đình',
    description: 'Combo 10 phần/tuần phù hợp 2 người ăn healthy.',
    details:
      'Gói gồm 10 phần ăn đa dạng món, giao linh hoạt trong tuần. Phù hợp cặp đôi hoặc gia đình nhỏ muốn ăn sạch tiện lợi.',
    images: ['combo-eat-clean-gia-dinh.jpg'],
    price: 1190000,
    calories: 1500,
    nutrition: { protein: 105, carb: 160, fat: 40 },
    ingredients: [
      { name: 'Mixed Lean Proteins', allergyTags: [] },
      { name: 'Whole Grains', allergyTags: [] },
      { name: 'Vegetable Mix', allergyTags: [] }
    ],
    tags: ['Combo', 'MealPlan', 'Family'],
    stock: 70,
    isActive: true,
    isCombo: true
  }),
  new Food({
    name: 'COMBO 04 GÓI ỨC GÀ VIÊN (MỚI)',
    description: 'Set combo 4 vị ức gà viên/chả/mọc, phù hợp eatclean, giảm cân hoặc tăng cơ.',
    details:
      '200 Gram/Gói\n\nCHẢ ỨC GÀ, MỌC ỨC GÀ, ỨC GÀ VIÊN được làm từ ức gà tươi 100%\n\n👉 Sản phẩm được sản xuất theo quy trình chuẩn VSATTP cao\n\n👉 Gia vị chuẩn eatclean chất lượng phù hợp với khách hàng đang tập GYM ăn theo chế độ giảm cân, hoặc tăng cơ với nhu cầu hàm lượng đạm cao\n\n👉 Cam kết tuyệt đối: KHÔNG hàn the, KHÔNG dầu mỡ, KHÔNG chất tạo màu\n\nSet Combo gồm 4 vị gồm 200 gram/gói/vị\n\n- VỊ RAU CỦ EATCLEAN: Ức gà (87%), carrot, hành lá, ngò rí, đường, tiêu đen xay, muối, gia vị khác\n- VỊ MẮM TỎI: Ức gà (88%), nước mắm, tỏi, tiêu đen xay, hành tím, đường, muối, gia vị khác\n- VỊ LÁ CHANH: Ức gà (89%), lá chanh, đường, muối, gia vị khác\n- VỊ NẤM HƯƠNG: Ức gà (88%) nấm hương, nấm mèo, tiêu đen xay, gia vị khác\n\n- Hướng dẫn sử dụng: Sản phẩm đã chín sẵn, rã đông chế biến tuỳ ý thích trước khi dùng. Có thể hâm nóng bằng lò vi sóng 2 phút, ăn kèm cơm, hoặc áp chảo với sốt.\n\n- Hướng dẫn bảo quản: Bảo quản cấp đông date 6 tháng. Sử dụng trong vòng 3 ngày sau khi mở túi. Bọc kín sản phẩm và cho vào tủ lạnh khi bảo quản để tránh ảnh hưởng đến chất lượng sản phẩm. Cảnh báo: Tuyệt đối không sử dụng sản phẩm nếu xuất hiện mốc hoặc mùi lạ.\n\n*** Vui lòng bảo quản sản phẩm trong tủ mát nhiệt độ 5 độ C sau khi nhận được sản phẩm. Sản phẩm có HSD 06 tháng. Nếu bạn muốn thay đổi mùi vị trong set sản phẩm, vui lòng mua trực tiếp trên trang chủ của Fitpack. https://bit.ly/shopee_fitpackvn',
    images: ['combo-04-goi-uc-ga-vien-moi.jpg'],
    price: 180000,
    calories: 880,
    nutrition: { protein: 124, carb: 18, fat: 30 },
    ingredients: [
      { name: 'Chicken Breast', allergyTags: [] },
      { name: 'Fish Sauce', allergyTags: ['Fish'] },
      { name: 'Mushroom', allergyTags: [] }
    ],
    tags: ['Combo', 'HighProtein', 'Gym', 'EatClean'],
    stock: 120,
    isActive: true,
    isCombo: true
  })
]

async function runSeed() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(dbname)
    const foodCollection = db.collection(process.env.DB_FOODS_COLLECTION as string)

    const existingFoods = await foodCollection
      .find({
        name: {
          $in: SAMPLE_FOODS.map((food) => food.name)
        }
      })
      .project({ name: 1 })
      .toArray()

    const existingNames = new Set(existingFoods.map((food) => food.name))
    const foodsToInsert = SAMPLE_FOODS.filter((food) => !existingNames.has(food.name))

    if (foodsToInsert.length === 0) {
      console.log('ℹ️ Không có món mới để insert. Dữ liệu seed đã tồn tại theo tên món.')
      return
    }

    const result = await foodCollection.insertMany(foodsToInsert)
    console.log(`✅ Successfully inserted ${result.insertedCount} foods into the database`)

    // Display summary
    console.log('\n📊 Inserted Foods Summary:')
    foodsToInsert.forEach((food, index) => {
      console.log(`${index + 1}. ${food.name} - ${food.calories} cal - ₫${food.price}`)
    })

    console.log(`\n✨ All done! Added ${result.insertedCount} new items to your food collection.`)
  } catch (error) {
    console.error('❌ Error seeding foods:', error)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\n🔌 Database connection closed')
  }
}

runSeed()
