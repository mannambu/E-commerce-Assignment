import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Flame,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Minus,
  ShoppingCart,
  CheckCircle2,
  PackageX,
  RotateCcw
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
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
  const { id } = useParams<{ id: string }>();
  const [qty, setQty] = useState(1);
  const { addItem, loading: cartLoading, mutating } = useCart();
  const navigate = useNavigate();
  const [cartError, setCartError] = useState('');
  const { user, isAuthenticated } = useAuth();
  const [foodItem, setFoodItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [canReviewFood, setCanReviewFood] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const fetchFoodItem = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      setFetchError(null);
      const response = await api.get(`/foods/${id}`);
      setFoodItem(response.data.result || response.data);
    } catch (error: any) {
      console.error('Lỗi khi tải thông tin món ăn:', error);
      setFetchError(error?.response?.data?.message || 'Không thể tải chi tiết món ăn. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFoodItem();
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

  // Personalized Allergy Warning Check
  const matchedUserAllergies = useMemo(() => {
    if (!user?.healthProfile?.allergies || !Array.isArray(user.healthProfile.allergies) || !foodItem) {
      return [];
    }

    const userAllergies = user.healthProfile.allergies.map((a: string) => a.trim().toLowerCase());
    const foodAllergies: string[] = [];

    if (Array.isArray(foodItem.allergyTags)) {
      foodAllergies.push(...foodItem.allergyTags.map((t: string) => String(t).trim().toLowerCase()));
    }

    if (Array.isArray(foodItem.ingredients)) {
      foodItem.ingredients.forEach((ing: any) => {
        if (Array.isArray(ing.allergyTags)) {
          foodAllergies.push(...ing.allergyTags.map((t: string) => String(t).trim().toLowerCase()));
        }
      });
    }

    const uniqueFoodAllergies = Array.from(new Set(foodAllergies));
    return uniqueFoodAllergies.filter((fa) => userAllergies.some((ua) => ua.includes(fa) || fa.includes(ua)));
  }, [user?.healthProfile?.allergies, foodItem]);

  // Inventory & Status checks
  const availableStock = foodItem?.availability?.availableQuantity ?? Math.max(0, (foodItem?.stock ?? 0) - (foodItem?.reservedStock ?? 0));
  const isOutOfStock = foodItem?.availability?.inStock === false || availableStock <= 0;
  const isDiscontinued = foodItem?.isActive === false;
  const maxQty = Math.max(1, Math.min(10, availableStock));

  const handleAddToCart = async () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (cartLoading || mutating) return;
    setCartError(''); setAddedToast(null);
    if (!foodItem || isOutOfStock || isDiscontinued) return;

    const res = await addItem(
      {
        id: foodItem._id || foodItem.id,
        name: foodItem.name,
        price: foodItem.price,
        image: foodItem.images?.[0] || 'https://picsum.photos/seed/food/400/300',
        calories: foodItem.calories || 0,
        type: 'food'
      },
      qty,
      { cartType: 'FOOD' }
    );

    if (res?.success) {
      setAddedToast(`Đã thêm ${qty} phần "${foodItem.name}" vào giỏ hàng!`);
      setTimeout(() => setAddedToast(null), 3500);
    } else {
      setCartError(res.message || 'Không thể thêm món vào giỏ hàng.');
    }
  };

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="pt-32 text-center font-bold text-gray-500 flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-semibold">Đang tải chi tiết món ăn...</p>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (fetchError || !foodItem) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <PackageX size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Không thể tìm thấy món ăn</h2>
            <p className="text-gray-500">{fetchError || 'Món ăn không tồn tại hoặc đã bị gỡ khỏi hệ thống.'}</p>
          </div>
          <div className="flex justify-center gap-4">
            <Link to="/food-catalog">
              <Button variant="outline" className="rounded-2xl px-6">
                <ArrowLeft size={18} className="mr-2" /> Về thực đơn
              </Button>
            </Link>
            <Button onClick={fetchFoodItem} className="rounded-2xl px-6">
              <RotateCcw size={18} className="mr-2" /> Thử lại
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation Back */}
        <Link
          to="/food-catalog"
          className="inline-flex items-center text-gray-500 hover:text-orange-500 transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} className="mr-2" /> Quay lại thực đơn
        </Link>

        {/* Personalized Allergy Warning Banner (NFR-USA-004) */}
        {matchedUserAllergies.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-red-50 border-2 border-red-300 flex items-start gap-3 text-red-800 shadow-sm"
          >
            <AlertTriangle size={24} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-sm uppercase tracking-wide">
                Cảnh báo dị ứng cá nhân
              </p>
              <p className="text-xs sm:text-sm mt-1 leading-relaxed">
                Món ăn này chứa thành phần trùng với danh sách dị ứng của bạn:{' '}
                <strong className="font-bold underline">{matchedUserAllergies.join(', ')}</strong>. Vui lòng cân nhắc kỹ trước khi đặt món để bảo vệ sức khỏe!
              </p>
            </div>
          </motion.div>
        )}

        {/* Success Toast Banner */}
        {cartError && <p role="alert" className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">{cartError}</p>}
        {addedToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-between text-green-800 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold">{addedToast}</p>
            </div>
            <Link to="/cart">
              <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs">
                Xem giỏ hàng
              </Button>
            </Link>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-2">
          {/* Image Gallery */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="aspect-[4/3] rounded-[40px] overflow-hidden shadow-xl border-4 border-gray-50 relative">
              <img
                src={foodItem.images?.[0] || 'https://picsum.photos/seed/food/800/600'}
                alt={foodItem.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {isOutOfStock && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
                  <span className="px-5 py-2.5 bg-red-600 text-white rounded-2xl font-black text-lg flex items-center gap-2 shadow-lg">
                    <AlertTriangle size={20} /> Hết hàng
                  </span>
                </div>
              )}
              {isDiscontinued && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                  <span className="px-5 py-2.5 bg-gray-700 text-white rounded-2xl font-black text-lg flex items-center gap-2 shadow-lg">
                    <PackageX size={20} /> Ngừng kinh doanh
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 gap-4">
              {(foodItem.images && foodItem.images.length > 0 ? foodItem.images : [1, 2, 3, 4])
                .slice(0, 4)
                .map((imgUrl: any, index: number) => (
                  <div
                    key={index}
                    className="aspect-square rounded-2xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity border border-gray-100"
                  >
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
              <div className="flex flex-wrap items-center gap-2">
                {foodItem.isCombo ? (
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wider">
                    Combo tuần
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wider">
                    Món đơn lẻ
                  </span>
                )}

                {isOutOfStock ? (
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
                    <AlertTriangle size={14} /> Hết hàng
                  </span>
                ) : isDiscontinued ? (
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-full flex items-center gap-1">
                    <PackageX size={14} /> Ngừng kinh doanh
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                    <CheckCircle2 size={14} /> Còn hàng {typeof foodItem.stock === 'number' ? `(${foodItem.stock})` : ''}
                  </span>
                )}

                <div className="flex items-center gap-1 text-amber-500 text-xs font-bold ml-auto">
                  <ShieldCheck size={16} />
                  <span>Đã kiểm định dinh dưỡng</span>
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight">
                {foodItem.name}
              </h1>

              <div className="flex items-center gap-6">
                <p className="text-3xl font-black text-orange-500">
                  {(foodItem.price || 0).toLocaleString('vi-VN')}đ
                </p>
                <div className="h-8 w-px bg-gray-200" />
                <div className="flex items-center gap-2 text-gray-600 font-bold">
                  <Flame size={22} className="text-orange-500" />
                  <span className="text-xl">{foodItem.calories || 0} kcal</span>
                </div>
              </div>
            </div>

            <p className="text-gray-600 leading-relaxed text-base italic">
              "{foodItem.description || 'Món ăn dinh dưỡng được thiết kế cân bằng năng lượng và dưỡng chất.'}"
            </p>

            {/* Nutrition Facts */}
            {foodItem.nutrition && Object.keys(foodItem.nutrition).length > 0 && (
              <div className="bg-orange-50/50 p-6 rounded-[28px] border border-orange-100 grid grid-cols-4 gap-4">
                {Object.entries(foodItem.nutrition).map(([key, value]) => {
                  const keyMap: Record<string, string> = {
                    protein: 'Đạm',
                    carbs: 'Carbs',
                    fat: 'Chất béo',
                    fiber: 'Chất xơ',
                    calories: 'Calo',
                    sodium: 'Natri'
                  };
                  return (
                    <div key={key} className="text-center space-y-1">
                      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        {keyMap[key.toLowerCase()] || key}
                      </p>
                      <p className="text-lg font-black text-gray-900">
                        {String(value)}
                        {['protein', 'carbs', 'fat', 'fiber'].includes(key.toLowerCase()) && typeof value === 'number' ? 'g' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ingredients & Allergies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ingredients */}
              {foodItem.ingredients && foodItem.ingredients.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <ShieldCheck size={18} className="text-green-500" /> Thành phần chính
                  </h3>
                  <ul className="space-y-1.5">
                    {foodItem.ingredients.map((ing: any, index: number) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                        {typeof ing === 'string' ? ing : ing.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Allergy Information */}
              {(() => {
                const allFoodAllergies: string[] = [];
                if (Array.isArray(foodItem.allergyTags)) {
                  allFoodAllergies.push(...foodItem.allergyTags);
                }
                if (Array.isArray(foodItem.ingredients)) {
                  foodItem.ingredients.forEach((ing: any) => {
                    if (Array.isArray(ing.allergyTags)) {
                      allFoodAllergies.push(...ing.allergyTags);
                    }
                  });
                }
                const uniqueAllergies = Array.from(new Set(allFoodAllergies));

                if (uniqueAllergies.length > 0) {
                  return (
                    <div className="space-y-3">
                      <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                        <AlertTriangle size={18} className="text-amber-500" /> Nhãn dị ứng
                      </h3>
                      <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 flex flex-wrap gap-1.5">
                        {uniqueAllergies.map((tag, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              'text-xs font-semibold px-2 py-0.5 rounded-lg border',
                              matchedUserAllergies.includes(tag.toLowerCase())
                                ? 'bg-red-100 text-red-800 border-red-300 font-bold'
                                : 'bg-white text-amber-800 border-amber-200'
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Actions */}
            <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center gap-4 bg-gray-100 p-2 rounded-2xl w-full sm:w-auto justify-between sm:justify-start">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1 || isOutOfStock || isDiscontinued}
                  className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-xs text-gray-500 hover:text-orange-500 disabled:opacity-40 transition-colors"
                >
                  <Minus size={18} />
                </button>
                <span className="w-12 text-center font-black text-lg">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(Math.min(maxQty, qty + 1))}
                  disabled={qty >= maxQty || isOutOfStock || isDiscontinued}
                  className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-xs text-gray-500 hover:text-orange-500 disabled:opacity-40 transition-colors"
                >
                  <Plus size={18} />
                </button>
              </div>

              <Button
                size="lg"
                className="w-full sm:flex-1 h-14 rounded-2xl text-lg shadow-xl shadow-orange-100 disabled:bg-gray-300 disabled:cursor-not-allowed"
                onClick={handleAddToCart}
                disabled={isOutOfStock || isDiscontinued || cartLoading || mutating}
              >
                {isOutOfStock ? (
                  <>
                    <AlertTriangle size={20} className="mr-2" /> Hết hàng
                  </>
                ) : isDiscontinued ? (
                  <>
                    <PackageX size={20} className="mr-2" /> Ngừng kinh doanh
                  </>
                ) : (
                  <>
                    <ShoppingCart size={20} className="mr-2" /> Thêm vào giỏ hàng • {((foodItem.price || 0) * qty).toLocaleString('vi-VN')}đ
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <ReviewSection
          sectionId="review"
          targetType="Food"
          targetId={String(foodItem._id || '')}
          title={foodItem.isCombo ? 'Đánh giá combo' : 'Đánh giá món ăn'}
          canCreateReview={canReviewFood}
          createBlockedReason="Chỉ khách hàng có đơn hàng đã hoàn thành chứa món này mới được đánh giá."
        />
      </main>
    </div>
  );
}
