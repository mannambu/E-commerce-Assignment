import { getDatabaseConfig } from '../src/utils/database-config'
import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import Food from '../src/models/schemas/Food.schema'
config()

const { uri, dbName: dbname } = getDatabaseConfig()

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
  })
]

async function runSeed() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')

    const db = client.db(dbname)
    const foodCollection = db.collection(process.env.DB_FOODS_COLLECTION || 'foods')

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
    process.exitCode = 1
  } finally {
    await client.close()
    console.log('\n🔌 Database connection closed')
  }
}

runSeed()
