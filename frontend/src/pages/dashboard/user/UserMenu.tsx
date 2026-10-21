import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Utensils,
  Calendar,
  Flame,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
  ShoppingCart,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  X,
  Layers,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import api from '@/services/api';

interface FoodItem {
  _id: string;
  name: string;
  calories: number;
  price: number;
  images?: string[];
  nutrition?: {
    protein: number;
    carb: number;
    fat: number;
  };
}

interface MealSlotItem {
  slot: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | string;
  targetCalories: number;
  food: FoodItem;
}

interface DayPlan {
  day: number;
  date: string;
  totalCalories: number;
  totalPrice?: number;
  nutrition?: {
    protein: number;
    carb: number;
    fat: number;
  };
  meals: MealSlotItem[];
}

interface RecommendationResponse {
  days: number;
  targetCalories: number;
  restrictions: string[];
  plans: DayPlan[];
}

const slotLabels: Record<string, { label: string; time: string; color: string }> = {
  Breakfast: { label: 'Bữa Sáng', time: '07:00 - 08:30', color: 'from-amber-400 to-orange-400' },
  Lunch: { label: 'Bữa Trưa', time: '11:30 - 13:00', color: 'from-orange-500 to-amber-500' },
  Dinner: { label: 'Bữa Tối', time: '18:00 - 19:30', color: 'from-purple-500 to-indigo-500' },
  Snack: { label: 'Bữa Phụ', time: '15:00 - 16:00', color: 'from-emerald-400 to-teal-500' },
};

export default function UserMenu() {
  const { user } = useAuth();
  const { cart, addItem, addBulkItems, clearCart, switchMode } = useCart();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [errorStatus, setErrorStatus] = useState<'none' | 'no_profile' | 'few_foods' | 'other'>('none');
  const [errorMessage, setErrorMessage] = useState('');

  // Selected Day trong tab tuần (0..6)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);

  // Swap popover/modal state
  const [swappingMeal, setSwappingMeal] = useState<{
    dayIndex: number;
    slot: string;
    food: FoodItem;
  } | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<FoodItem[]>([]);
  const [loadingSwap, setLoadingSwap] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  // Adding to cart state
  const [isAddingCart, setIsAddingCart] = useState(false);
  const [cartSuccessMessage, setCartSuccessMessage] = useState<string | null>(null);
  const [showModeConflictModal, setShowModeConflictModal] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<'today' | 'week' | null>(null);

  // Tải dữ liệu gợi ý thực đơn (FR-MNU-001)
  const fetchRecommendations = async (days: 1 | 7) => {
    try {
      setLoading(true);
      setErrorStatus('none');
      setErrorMessage('');

      const res = await api.post('/users/recommendations/meals', { days });
      const result: RecommendationResponse = res.data?.result;

      if (!result || !result.plans || result.plans.length === 0) {
        setErrorStatus('few_foods');
        return;
      }

      setData(result);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || '';

      if (status === 400 && msg.includes('hồ sơ sức khỏe')) {
        // FR-HLT-004: Chưa có hồ sơ sức khỏe -> chuyển hướng về /health-survey
        navigate('/health-survey', { replace: true });
        return;
      } else if (status === 404 || msg.includes('Không tìm thấy món ăn')) {
        // FR-MNU-006: Quá ít món hợp
        setErrorStatus('few_foods');
        setErrorMessage(msg || 'Quá ít món ăn phù hợp với danh sách dị ứng của bạn.');
      } else {
        setErrorStatus('other');
        setErrorMessage(msg || 'Không thể tải thực đơn gợi ý lúc này.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations(activeTab === 'today' ? 1 : 7);
  }, [activeTab]);

  const currentPlan: DayPlan | undefined =
    activeTab === 'today'
      ? data?.plans?.[0]
      : data?.plans?.[selectedDayIndex] || data?.plans?.[0];

  const targetCalories = data?.targetCalories || user?.healthProfile?.targetCalories || 2000;
  const currentTotalCalories = currentPlan?.totalCalories || 0;
  const caloDelta = currentTotalCalories - targetCalories;
  const caloPercentage = targetCalories > 0 ? Math.round((currentTotalCalories / targetCalories) * 100) : 100;

  // Ngưỡng mềm ±10% Target (FR-MNU-005)
  const isDeviationSoft = Math.abs(caloDelta) > targetCalories * 0.1;

  // Mở modal Đổi món (FR-MNU-007)
  const handleOpenSwap = async (dayIndex: number, slot: string, food: FoodItem) => {
    setSwappingMeal({ dayIndex, slot, food });
    setSwapCandidates([]);
    setSwapError(null);
    setLoadingSwap(true);

    try {
      const res = await api.post('/users/recommendations/meals/swap', {
        current_food_id: food._id,
        target_calories: food.calories,
      });

      const swapResult = res.data?.result;
      const candidates: FoodItem[] = swapResult?.candidates || [];
      if (swapResult?.swappedTo && !candidates.some((c) => c._id === swapResult.swappedTo._id)) {
        candidates.unshift(swapResult.swappedTo);
      }

      if (candidates.length === 0) {
        setSwapError('Không còn món thay thế phù hợp trong khoảng ±15% calo đã lọc dị ứng.');
      } else {
        setSwapCandidates(candidates);
      }
    } catch (err: any) {
      setSwapError(err.response?.data?.message || 'Không tìm thấy món thay thế phù hợp.');
    } finally {
      setLoadingSwap(false);
    }
  };

  // Chọn món thay thế (FR-MNU-009)
  const handleSelectReplacement = (newFood: FoodItem) => {
    if (!swappingMeal || !data) return;

    const { dayIndex, slot } = swappingMeal;
    const updatedPlans = [...data.plans];
    const plan = updatedPlans[dayIndex];
    if (!plan) return;

    // Cập nhật món trong slot
    plan.meals = plan.meals.map((m) => (m.slot === slot ? { ...m, food: newFood } : m));

    // Tính lại tổng Calo và Macro của ngày đó
    let newTotalCal = 0;
    let newProtein = 0;
    let newCarb = 0;
    let newFat = 0;
    let newTotalPrice = 0;

    plan.meals.forEach((m) => {
      newTotalCal += m.food.calories || 0;
      newTotalPrice += m.food.price || 0;
      if (m.food.nutrition) {
        newProtein += m.food.nutrition.protein || 0;
        newCarb += m.food.nutrition.carb || 0;
        newFat += m.food.nutrition.fat || 0;
      }
    });

    plan.totalCalories = newTotalCal;
    plan.totalPrice = newTotalPrice;
    plan.nutrition = { protein: newProtein, carb: newCarb, fat: newFat };

    setData({ ...data, plans: updatedPlans });
    setSwappingMeal(null);
  };

  // Thêm thực đơn vào giỏ hàng
  const handleAddToCart = async (mode: 'today' | 'week') => {
    if (!data || !data.plans) return;
    setCartSuccessMessage(null);

    const requiredCartType = mode === 'today' ? 'FOOD' : 'COMBO';

    // Kiểm tra xung đột chế độ giỏ hàng
    if (cart && cart.items.length > 0 && cart.cartType !== requiredCartType) {
      setPendingBulkAction(mode);
      setShowModeConflictModal(true);
      return;
    }

    setIsAddingCart(true);

    try {
      if (mode === 'today') {
        const todayMeals = currentPlan?.meals || [];
        for (const meal of todayMeals) {
          if (meal.food?._id) {
            await addItem(
              { id: meal.food._id, name: meal.food.name, price: meal.food.price, calories: meal.food.calories },
              1,
              {
                deliveryDate: currentPlan?.date,
                mealSlot: meal.slot,
                cartType: 'FOOD',
              }
            );
          }
        }
        setCartSuccessMessage('Đã thêm 4 bữa của hôm nay vào giỏ hàng!');
      } else {
        // Gói tuần 7 ngày × 4 bữa = 28 món
        const bulkItems: Array<{ itemId: string; quantity: number; deliveryDate?: string; mealSlot?: string }> = [];

        data.plans.forEach((plan) => {
          plan.meals.forEach((meal) => {
            if (meal.food?._id) {
              bulkItems.push({
                itemId: meal.food._id,
                quantity: 1,
                deliveryDate: plan.date,
                mealSlot: meal.slot,
              });
            }
          });
        });

        const res = await addBulkItems(bulkItems, 'COMBO');
        if (res.success) {
          setCartSuccessMessage('Đã thêm toàn bộ 28 bữa của cả tuần vào giỏ COMBO!');
        } else {
          alert(res.message || 'Lỗi thêm gói tuần vào giỏ');
        }
      }
    } catch (err) {
      console.error('Lỗi thêm giỏ hàng:', err);
    } finally {
      setIsAddingCart(false);
    }
  };

  // Xác nhận làm trống giỏ để đổi chế độ
  const handleConfirmSwitchMode = async () => {
    try {
      setIsAddingCart(true);
      await clearCart();
      const targetMode = pendingBulkAction === 'today' ? 'FOOD' : 'COMBO';
      await switchMode(targetMode);
      setShowModeConflictModal(false);

      if (pendingBulkAction) {
        await handleAddToCart(pendingBulkAction);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingCart(false);
      setPendingBulkAction(null);
    }
  };

  return (
    <div className="flex h-screen bg-[#fafafa] overflow-hidden">
      <Sidebar role="Customer" />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <Header title="Gợi ý thực đơn cá nhân (WF-08)" />

        <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Tabs: Hôm nay vs Cả tuần */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              <button
                onClick={() => setActiveTab('today')}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] ${
                  activeTab === 'today' ? 'bg-white text-orange-600 shadow-md' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hôm nay (1 ngày — 4 bữa)
              </button>
              <button
                onClick={() => setActiveTab('week')}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] ${
                  activeTab === 'week' ? 'bg-white text-orange-600 shadow-md' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cả tuần (7 ngày gói Combo)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRecommendations(activeTab === 'today' ? 1 : 7)}
                className="min-h-[44px]"
              >
                <RefreshCw size={16} className={`mr-1.5 ${loading ? 'animate-spin text-orange-500' : ''}`} /> Làm mới thực đơn
              </Button>
            </div>
          </div>

          {/* Cart Success Alert */}
          {cartSuccessMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-sm">
              <span className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="text-emerald-600" size={18} /> {cartSuccessMessage}
              </span>
              <Link to="/cart">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[36px]">
                  Xem giỏ hàng <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="py-24 text-center space-y-3">
              <RefreshCw className="animate-spin text-orange-500 mx-auto" size={40} />
              <p className="text-slate-500 text-sm font-medium">Đang tối ưu thực đơn bám sát mục tiêu calo & lọc dị ứng...</p>
            </div>
          ) : errorStatus === 'few_foods' ? (
            /* TRẠNG THÁI QUÁ ÍT MÓN HỢP (FR-MNU-006) */
            <div className="py-16 px-6 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-sm">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Quá ít món phù hợp</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                {errorMessage ||
                  'Do danh sách dị ứng hoặc số lượng tồn kho khả dụng quá ít, hệ thống không thể ghép đủ 4 bữa trọn vẹn cho bạn.'}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Link to="/health-survey">
                  <Button variant="outline" className="min-h-[44px]">
                    Điều chỉnh danh sách dị ứng
                  </Button>
                </Link>
                <Button
                  onClick={() => alert('Cố vấn dinh dưỡng FitBite sẽ liên hệ bạn qua email hoặc số điện thoại trong 15 phút.')}
                  className="min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold"
                >
                  <HelpCircle size={16} className="mr-1.5" /> Liên hệ cố vấn
                </Button>
              </div>
            </div>
          ) : !currentPlan ? (
            <div className="py-20 text-center text-slate-400">Không có dữ liệu thực đơn.</div>
          ) : (
            <div className="space-y-6">
              {/* Day Selector (cho tab Tuần) */}
              {activeTab === 'week' && data?.plans && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {data.plans.map((p, idx) => (
                    <button
                      key={p.day}
                      onClick={() => setSelectedDayIndex(idx)}
                      className={`px-5 py-3 rounded-2xl font-bold text-xs whitespace-nowrap transition-all border min-h-[44px] flex flex-col items-center gap-0.5 ${
                        selectedDayIndex === idx
                          ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span className="uppercase tracking-wider">Ngày {p.day}</span>
                      <span className={selectedDayIndex === idx ? 'text-orange-100 font-mono' : 'text-slate-400 font-mono'}>
                        {p.date}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Progress & Target Banner (FR-MNU-001..004) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-orange-50 text-orange-600 font-bold text-xs rounded-full inline-flex items-center gap-1">
                        <Flame size={14} /> Target: {targetCalories} kcal
                      </span>
                      {data?.restrictions && data.restrictions.length > 0 && (
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full inline-flex items-center gap-1">
                          <ShieldCheck size={14} /> Đã lọc dị ứng: {data.restrictions.join(', ')}
                        </span>
                      )}
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mt-2">
                      {activeTab === 'today' ? 'Thực đơn hôm nay' : `Thực đơn Ngày ${currentPlan.day} (${currentPlan.date})`}
                    </h2>
                  </div>

                  <div className="text-right self-end sm:self-auto">
                    <p className="text-xs font-bold text-slate-400 uppercase">Tổng Calo ngày</p>
                    <p className="text-3xl font-black text-slate-900 font-mono">
                      {currentTotalCalories} <span className="text-sm font-bold text-slate-400">kcal</span>
                    </p>
                    <p className={`text-xs font-bold mt-0.5 ${isDeviationSoft ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {caloPercentage}% mục tiêu {caloDelta > 0 ? `(+${caloDelta} kcal)` : `(${caloDelta} kcal)`}
                    </p>
                  </div>
                </div>

                {/* Cờ Thực đơn gần đúng (FR-MNU-005) */}
                {isDeviationSoft && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold">Cờ: Thực đơn gần đúng (Lệch ngoài ngưỡng mềm ±10% Target)</p>
                      <p className="text-amber-800 leading-relaxed">
                        Mức calo ngày chênh lệch {Math.abs(caloDelta)} kcal so với mục tiêu. Bạn có thể bấm "Đổi món" ở các bữa bên dưới để chọn suất ăn tương đương hơn hoặc xác nhận giữ lựa chọn này.
                      </p>
                    </div>
                  </div>
                )}

                {/* 3 Thanh Macro Ngày: Đạm 30% / Carb 40% / Fat 30% (FR-MNU-004) */}
                {currentPlan.nutrition && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                      <span>Phân bổ Macro ngày:</span>
                      <span className="font-mono">
                        P: {currentPlan.nutrition.protein}g | C: {currentPlan.nutrition.carb}g | F: {currentPlan.nutrition.fat}g
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                        <p className="text-[10px] font-bold text-orange-800 uppercase">Đạm (Protein)</p>
                        <p className="text-lg font-black text-orange-600 font-mono">{currentPlan.nutrition.protein} g</p>
                      </div>
                      <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                        <p className="text-[10px] font-bold text-amber-800 uppercase">Carb</p>
                        <p className="text-lg font-black text-amber-600 font-mono">{currentPlan.nutrition.carb} g</p>
                      </div>
                      <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-800 uppercase">Chất béo (Fat)</p>
                        <p className="text-lg font-black text-blue-600 font-mono">{currentPlan.nutrition.fat} g</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 Bữa ăn: Sáng, Trưa, Tối, Phụ */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {currentPlan.meals.map((meal) => {
                  const meta = slotLabels[meal.slot] || {
                    label: meal.slot,
                    time: '12:00',
                    color: 'from-slate-400 to-slate-500',
                  };

                  return (
                    <div
                      key={meal.slot}
                      className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 bg-slate-100 text-slate-800 rounded-full font-bold text-xs uppercase tracking-wider">
                            {meta.label} ({meta.time})
                          </span>
                          <span className="text-xs font-bold text-orange-600 font-mono">
                            Mục tiêu: ~{meal.targetCalories} kcal
                          </span>
                        </div>

                        {meal.food ? (
                          <div className="flex gap-4 items-center">
                            <img
                              src={
                                meal.food.images?.[0] ||
                                'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'
                              }
                              alt={meal.food.name}
                              className="w-20 h-20 rounded-2xl object-cover border border-slate-100 flex-shrink-0"
                            />
                            <div className="space-y-1">
                              <h4 className="font-bold text-base text-slate-900 leading-snug line-clamp-1">{meal.food.name}</h4>
                              <p className="text-sm font-black text-orange-600 font-mono">
                                {meal.food.calories} kcal • {meal.food.price?.toLocaleString('vi-VN')} đ
                              </p>
                              {meal.food.nutrition && (
                                <p className="text-[11px] text-slate-400 font-mono">
                                  P: {meal.food.nutrition.protein}g • C: {meal.food.nutrition.carb}g • F: {meal.food.nutrition.fat}g
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Chưa có món cho bữa này.</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenSwap(activeTab === 'today' ? 0 : selectedDayIndex, meal.slot, meal.food)}
                          className="min-h-[40px] text-xs font-bold rounded-xl"
                        >
                          <RefreshCw size={14} className="mr-1.5 text-orange-500" /> Đổi món (Swap)
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action: Thêm cả ngày vào giỏ hoặc Đặt cả tuần */}
              <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold">Sẵn sàng đặt món?</p>
                  <p className="text-base font-black text-slate-900">
                    {activeTab === 'today' ? 'Đặt trọn vẹn 4 bữa của hôm nay' : 'Đặt trọn vẹn 28 bữa của cả tuần 7 ngày'}
                  </p>
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  {activeTab === 'today' ? (
                    <Button
                      onClick={() => handleAddToCart('today')}
                      disabled={isAddingCart}
                      className="w-full sm:w-auto min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 rounded-2xl shadow-lg shadow-orange-500/25"
                    >
                      {isAddingCart ? (
                        <>
                          <RefreshCw className="animate-spin mr-2" size={16} /> Đang thêm...
                        </>
                      ) : (
                        <>
                          <ShoppingCart size={18} className="mr-2" /> Thêm cả ngày vào giỏ (FOOD)
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleAddToCart('week')}
                      disabled={isAddingCart}
                      className="w-full sm:w-auto min-h-[44px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-8 rounded-2xl shadow-xl shadow-orange-500/25"
                    >
                      {isAddingCart ? (
                        <>
                          <RefreshCw className="animate-spin mr-2" size={16} /> Đang thêm 28 món...
                        </>
                      ) : (
                        <>
                          <Layers size={18} className="mr-2" /> Đặt cả tuần (COMBO 7 ngày)
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Popover / Panel Đổi món (FR-MNU-007..009) */}
      {swappingMeal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-t-[32px] sm:rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col p-6 sm:p-8 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900">Đổi món: {slotLabels[swappingMeal.slot]?.label || swappingMeal.slot}</h3>
                <p className="text-xs text-slate-400">
                  Món hiện tại: {swappingMeal.food.name} ({swappingMeal.food.calories} kcal)
                </p>
              </div>
              <button onClick={() => setSwappingMeal(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="Đóng">
                <X size={20} />
              </button>
            </div>

            {loadingSwap ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw className="animate-spin mx-auto text-orange-500" size={32} />
                <p className="text-xs text-slate-400">Đang tìm các món thay thế trong khoảng ±15% calo...</p>
              </div>
            ) : swapError ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-2">
                <p className="font-bold">{swapError}</p>
                <p>Không có món thay thế nào khác thỏa mãn điều kiện dị ứng và calo.</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chọn món thay thế:</p>
                {swapCandidates.map((candidate) => {
                  const caloDiff = candidate.calories - swappingMeal.food.calories;
                  return (
                    <div
                      key={candidate._id}
                      onClick={() => handleSelectReplacement(candidate)}
                      className="p-3.5 rounded-2xl border border-slate-200 hover:border-orange-500 hover:bg-orange-50/30 transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={
                            candidate.images?.[0] ||
                            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=200&q=80'
                          }
                          alt={candidate.name}
                          className="w-14 h-14 rounded-xl object-cover border border-slate-100 flex-shrink-0"
                        />
                        <div>
                          <p className="font-bold text-sm text-slate-900 line-clamp-1">{candidate.name}</p>
                          <p className="text-xs font-mono text-orange-600 font-bold mt-0.5">
                            {candidate.calories} kcal • {candidate.price?.toLocaleString('vi-VN')} đ
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Chênh lệch: {caloDiff > 0 ? `+${caloDiff}` : caloDiff} kcal
                          </p>
                        </div>
                      </div>

                      <Button size="sm" variant="outline" className="min-h-[36px] text-xs">
                        Chọn món
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Modal Xung đột Chế độ Giỏ hàng */}
      {showModeConflictModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl"
          >
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle size={28} />
              <h3 className="font-bold text-lg text-slate-900">Xung đột chế độ giỏ hàng</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Giỏ hàng của bạn hiện đang chứa món ở chế độ <strong>{cart?.cartType === 'FOOD' ? 'Mua lẻ (FOOD)' : 'Gói tuần (COMBO)'}</strong>. Hệ thống không thể trộn lẫn hai chế độ.
            </p>
            <p className="text-xs text-slate-500">
              Bạn có muốn làm trống giỏ hàng hiện tại để chuyển sang chế độ{' '}
              <strong>{pendingBulkAction === 'today' ? 'FOOD' : 'COMBO'}</strong> và thêm thực đơn mới này không?
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setShowModeConflictModal(false)} className="min-h-[44px]">
                Hủy bỏ
              </Button>
              <Button onClick={handleConfirmSwitchMode} className="min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold">
                Xóa giỏ & Thêm mới
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
