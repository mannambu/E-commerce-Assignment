import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Flame, Clock, ShieldCheck, AlertTriangle, Plus, Minus, ShoppingCart, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/layout/Navbar';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import api from '@/services/api'; 
import ReviewSection from '@/components/customer/ReviewSection';
import { useAuth } from '@/context/AuthContext';

type UserOrder = {
  status?: string;
  items?: Array<{
    itemId?: string;
  }>;
};

export default function FoodDetails() {
  const { id } = useParams();
  const [qty, setQty] = useState(1);
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();
  const [foodItem, setFoodItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [canReviewFood, setCanReviewFood] = useState(false);

  useEffect(() => {
    const fetchFoodItem = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/foods/${id}`);
        // API Spec quy định data thường nằm trong response.data.result
        setFoodItem(response.data.result || response.data);
      } catch (error) {
        console.error("Lỗi khi tải thông tin món ăn:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchFoodItem();
    }
  }, [id]);

  useEffect(() => {
    const fetchReviewEligibility = async () => {
      if (!isAuthenticated || !id) {
        setCanReviewFood(false);
        return;
      }

      try {
        const res = await api.get('/orders');
        const orders = Array.isArray(res.data?.result) ? (res.data.result as UserOrder[]) : [];

        const eligible = orders.some((order) => {
          if (order.status !== 'Completed') return false;
          const items = Array.isArray(order.items) ? order.items : [];
          return items.some((item) => String(item.itemId || '') === String(id));
        });

        setCanReviewFood(eligible);
      } catch {
        setCanReviewFood(false);
      }
    };

    fetchReviewEligibility();
  }, [id, isAuthenticated]);

  const handleAddToCart = () => {
    if (!foodItem) return;
    addItem({
      id: foodItem._id || foodItem.id, // BE dùng _id
      name: foodItem.name,
      price: foodItem.price,
      image: foodItem.images?.[0] || 'https://picsum.photos/seed/food/400/300', // Lấy ảnh đầu tiên
      calories: foodItem.calories || 0,
      type: 'food'
    }, qty);
  };

  // 1. Phải có màn hình Loading chờ API trả data về, nếu không sẽ crash
  if (isLoading || !foodItem) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="pt-32 text-center font-bold text-gray-500 flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          Đang tải chi tiết món ăn...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/food-catalog" className="inline-flex items-center text-gray-500 hover:text-orange-500 mb-8 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Quay lại thực đơn
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image Gallery */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="aspect-[4/3] rounded-[40px] overflow-hidden shadow-2xl border-8 border-gray-50">
              <img 
                // 2. Sửa lại cách lấy ảnh từ Backend
                src={foodItem.images?.[0] || 'https://picsum.photos/seed/food/800/600'} 
                alt={foodItem.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {/* Hiển thị danh sách ảnh nếu Backend có trả về mảng images */}
              {(foodItem.images || [1, 2, 3, 4]).slice(0, 4).map((imgUrl: any, index: number) => (
                <div key={index} className="aspect-square rounded-2xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
                  <img 
                    src={typeof imgUrl === 'string' ? imgUrl : `https://picsum.photos/seed/food${index}/200/200`} 
                    alt={`Gallery ${index}`} 
                    className="w-full h-full object-cover" 
                  />
                </div>
              ))}
            </div>
          </motion.div>

          {/* Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {foodItem.isCombo ? (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wider">Combo tuần</span>
                ) : null}
                <span className="px-3 py-1 bg-orange-100 text-orange-600 text-xs font-bold rounded-full uppercase tracking-wider">Bán chạy nhất</span>
                <div className="flex items-center gap-1 text-yellow-500">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-bold">Đã kiểm định dinh dưỡng</span>
                </div>
              </div>
              <h1 className="text-4xl font-black text-gray-900 leading-tight">{foodItem.name}</h1>
              <div className="flex items-center gap-6">
                <p className="text-3xl font-black text-orange-500">{(foodItem.price || 0).toLocaleString('vi-VN')}đ</p>
                <div className="h-8 w-px bg-gray-100" />
                <div className="flex items-center gap-2 text-gray-500">
                  <Flame size={20} className="text-orange-500" />
                  <span className="font-bold">{foodItem.calories || 0} kcal</span>
                </div>
              </div>
            </div>

            <p className="text-gray-500 leading-relaxed text-lg italic">"{foodItem.description || 'Chưa có mô tả chi tiết'}"</p>

            {/* Nutrition Facts - Xử lý an toàn nếu BE không trả về */}
            {foodItem.nutrition && Object.keys(foodItem.nutrition).length > 0 && (
              <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 grid grid-cols-4 gap-4">
                {Object.entries(foodItem.nutrition).map(([key, value]) => (
                  <div key={key} className="text-center space-y-1">
                    <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">{key}</p>
                    <p className="text-lg font-black text-gray-900">{value as React.ReactNode}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Ingredients & Allergies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Thành phần (Nếu có) */}
              {(foodItem.ingredients && foodItem.ingredients.length > 0) && (
                <div className="space-y-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <ShieldCheck size={18} className="text-green-500" /> Thành phần chính
                  </h3>
                  <ul className="space-y-2">
                    {/* SỬA LẠI: Đọc ing.name thay vì ing */}
                    {foodItem.ingredients.map((ing: any, index: number) => (
                      <li key={index} className="text-sm text-gray-500 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" /> {ing.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dị ứng (Tự động gom nhóm allergyTags từ các thành phần) */}
              {foodItem.ingredients && (
                (() => {
                  // Gom tất cả các allergyTags từ mảng ingredients lại và lọc trùng nhau
                  const allAllergies = Array.from(
                    new Set(foodItem.ingredients.flatMap((ing: any) => ing.allergyTags || []))
                  );

                  if (allAllergies.length > 0) {
                    return (
                      <div className="space-y-3">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                          <AlertTriangle size={18} className="text-orange-500" /> Cảnh báo dị ứng
                        </h3>
                        <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100">
                          <p className="text-xs text-orange-700 font-medium">{allAllergies.join(', ')}</p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>

            {/* Actions */}
            <div className="pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-4 bg-gray-100 p-2 rounded-2xl w-full sm:w-auto justify-between sm:justify-start">
                <button 
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-500 hover:text-orange-500 transition-colors"
                >
                  <Minus size={20} />
                </button>
                <span className="w-12 text-center font-black text-lg">{qty}</span>
                <button 
                  onClick={() => setQty(qty + 1)}
                  className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-sm text-gray-500 hover:text-orange-500 transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              <Button 
                size="lg" 
                className="w-full sm:flex-1 h-14 rounded-2xl text-lg shadow-xl shadow-orange-200"
                onClick={handleAddToCart}
              >
                <ShoppingCart size={20} className="mr-2" /> Thêm vào giỏ hàng
              </Button>
            </div>
          </div>
        </div>

        <ReviewSection
          sectionId="review"
          targetType="Food"
          targetId={String(foodItem._id || '')}
          title={foodItem.isCombo ? 'Đánh giá combo' : 'Đánh giá món ăn'}
          canCreateReview={canReviewFood}
          createBlockedReason="Chỉ được đánh giá món đã có trong đơn hàng hoàn thành của bạn."
        />
      </main>
    </div>
  );
}