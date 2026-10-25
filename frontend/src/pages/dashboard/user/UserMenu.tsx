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
  RotateCcw
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

      const res = await api.post(`/users/recommendations/meals?t=${Date.now()}`, { days });
      const result: RecommendationResponse = res.data?.result;

      if (!result || !result.plans || result.plans.length === 0) {
        setErrorStatus('few_foods');
        return;
      }

      setData(result);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || '';

      if (status === 400 && (msg.includes('hồ sơ sức khỏe') || msg.includes('HEALTH_PROFILE'))) {
        navigate('/health-survey', {
          replace: true,
          state: { notice: 'Vui lòng hoàn thành khảo sát sức khỏe trước khi xem thực đơn gợi ý.' }
        });
        return;
      } else if (status === 404 || msg.includes('Không tìm thấy món ăn')) {
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
    if (user && !user.healthProfile) {
      navigate('/health-survey', {
        replace: true,
        state: { notice: 'Vui lòng hoàn thành khảo sát sức khỏe trước khi xem thực đơn gợi ý.' }
      });
      return;
    }
    fetchRecommendations(activeTab === 'today' ? 1 : 7);
  }, [activeTab, user]);

  const currentPlan: DayPlan | undefined =
    activeTab === 'today'
      ? data?.plans?.[0]
      : data?.plans?.[selectedDayIndex] || data?.plans?.[0];

  const targetCalories = data?.targetCalories || user?.healthProfile?.targetCalories || 2468;
  const currentTotalCalories = currentPlan?.totalCalories || 2125;
  const caloDelta = currentTotalCalories - targetCalories;
  const caloPercentage = targetCalories > 0 ? Math.round((currentTotalCalories / targetCalories) * 100) : 86;

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

    plan.meals = plan.meals.map((m) => (m.slot === slot ? { ...m, food: newFood } : m));

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
  const handleAddToCart = async (mode: 'today' | 'week', modeAlreadySwitched = false) => {
    if (!data || !data.plans) return;
    setCartSuccessMessage(null);

    const requiredCartType = mode === 'today' ? 'FOOD' : 'COMBO';

    if (!modeAlreadySwitched && cart && cart.items.length > 0 && cart.cartType !== requiredCartType) {
      setPendingBulkAction(mode);
      setShowModeConflictModal(true);
      return;
    }

    setIsAddingCart(true);

    try {
      if (mode === 'today') {
        const todayMeals = currentPlan?.meals || [];
        const itemsToAdd: Array<{ itemId: string; quantity: number; deliveryDate?: string; mealSlot?: string }> = [];

        for (const meal of todayMeals) {
          if (meal.food?._id) {
            itemsToAdd.push({
              itemId: meal.food._id,
              quantity: 1,
              deliveryDate: currentPlan?.date,
              mealSlot: meal.slot,
            });
          }
        }

        if (itemsToAdd.length === 0) return;

        const res = await addBulkItems(itemsToAdd, 'FOOD');
        if (res.success) {
          setCartSuccessMessage('Đã thêm 4 bữa của hôm nay vào giỏ hàng!');
        } else {
          alert(res.message || 'Không thể thêm thực đơn vào giỏ hàng');
        }
      } else {
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

        if (bulkItems.length === 0) return;

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
      const result = await switchMode(targetMode);
      if (!result.success) throw new Error(result.message || 'Không thể đổi chế độ giỏ hàng.');
      setShowModeConflictModal(false);

      if (pendingBulkAction) {
        await handleAddToCart(pendingBulkAction, true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể đổi chế độ giỏ hàng.');
    } finally {
      setIsAddingCart(false);
      setPendingBulkAction(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#faf8f5] relative overflow-hidden">
      
      {/* BACKGROUND DẢI SÓNG PASTEL MỜ MĨN */}
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg
          className="w-full h-full"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="menu-wave-orange" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a44" />
              <stop offset="100%" stopColor="#fc6076" />
            </linearGradient>
            <linearGradient id="menu-wave-mint" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#80d0c7" />
              <stop offset="100%" stopColor="#0093e9" />
            </linearGradient>
            <linearGradient id="menu-wave-blue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#74ebd5" />
              <stop offset="100%" stopColor="#9aceff" />
            </linearGradient>
            <linearGradient id="menu-wave-pink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a9e" />
              <stop offset="100%" stopColor="#fecfef" />
            </linearGradient>
          </defs>

          <path
            d="M-100,-50 C300,100 450,280 150,450 C-100,550 -200,300 -100,-50 Z"
            fill="url(#menu-wave-orange)"
            className="opacity-20 blur-3xl"
          />
          <path
            d="M800,-100 C1100,50 1550,150 1550,400 C1300,450 950,250 800,-100 Z"
            fill="url(#menu-wave-mint)"
            className="opacity-15 blur-3xl"
          />
          <path
            d="M-150,550 C200,450 450,700 250,950 C0,1050 -150,850 -150,550 Z"
            fill="url(#menu-wave-blue)"
            className="opacity-15 blur-3xl"
          />
          <path
            d="M900,500 C1250,550 1600,700 1500,1000 C1100,1000 850,750 900,500 Z"
            fill="url(#menu-wave-pink)"
            className="opacity-20 blur-3xl"
          />
        </svg>
      </div>

      <Sidebar role="Customer" />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0 z-10">
        <Header title="Gợi ý thực đơn cá nhân (WF-08)" />

        <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          
          {/* TAB CHỌN CHẾ ĐỘ (HÔM NAY / CẢ TUẦN) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white/90 backdrop-blur-md p-3 rounded-3xl border border-white/80 shadow-xs">
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl">
              <button
                onClick={() => setActiveTab('today')}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] ${
                  activeTab === 'today' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hôm nay (1 ngày — 4 bữa)
              </button>
              <button
                onClick={() => setActiveTab('week')}
                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-sm font-bold transition-all min-h-[44px] ${
                  activeTab === 'week' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
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
                className="min-h-[44px] rounded-xl text-sm font-bold px-4 border-gray-200"
              >
                <RotateCcw size={16} className={`mr-2 ${loading ? 'animate-spin text-orange-500' : ''}`} /> Làm mới thực đơn
              </Button>
            </div>
          </div>

          {/* Cart Success Alert */}
          {cartSuccessMessage && (
            <div className="p-4 bg-emerald-50/90 backdrop-blur-md border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-800 text-sm shadow-xs">
              <span className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="text-emerald-600" size={18} /> {cartSuccessMessage}
              </span>
              <Link to="/cart">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-[36px] rounded-xl">
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
            <div className="py-16 px-6 bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 text-center space-y-4 shadow-xs">
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
                  <Button variant="outline" className="min-h-[44px] rounded-xl">
                    Điều chỉnh danh sách dị ứng
                  </Button>
                </Link>
                <Button
                  onClick={() => alert('Cố vấn dinh dưỡng FitBite sẽ liên hệ bạn qua email hoặc số điện thoại trong 15 phút.')}
                  className="min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl"
                >
                  <HelpCircle size={16} className="mr-1.5" /> Liên hệ cố vấn
                </Button>
              </div>
            </div>
          ) : !currentPlan ? (
            <div className="py-20 text-center text-slate-400">Không có dữ liệu thực đơn.</div>
          ) : (
            <div className="space-y-6">
              
              {/* THANH CHỌN NGÀY TẠI TAB CẢ TUẦN */}
              {activeTab === 'week' && data?.plans && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 w-full">
                  {data.plans.map((p, idx) => (
                    <button
                      key={p.day}
                      onClick={() => setSelectedDayIndex(idx)}
                      className={`w-full py-3.5 px-3 rounded-2xl font-bold text-xs transition-all border min-h-[52px] flex flex-col items-center justify-center gap-1 ${
                        selectedDayIndex === idx
                          ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-[1.02]'
                          : 'border-slate-200/80 bg-white/90 backdrop-blur-md text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="uppercase tracking-wider font-extrabold text-[11px]">NGÀY {p.day}</span>
                      <span className={selectedDayIndex === idx ? 'text-orange-100 font-mono text-[10px]' : 'text-slate-400 font-mono text-[10px]'}>
                        {p.date}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* BANNER THỰC ĐƠN: CHIA 2 CỘT SANG BÊN TRÁI & PHẢI TRÀN ĐỀU */}
              <div className="bg-white/90 backdrop-blur-md p-6 sm:p-8 rounded-[32px] border border-white/80 shadow-xs space-y-6">
                
                {/* Tiêu đề Thực đơn */}
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    {activeTab === 'today'
                      ? 'Thực đơn hôm nay'
                      : `Thực đơn Ngày ${currentPlan.day} (${currentPlan.date})`}
                  </h2>
                  {data?.restrictions && data.restrictions.length > 0 && (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full inline-flex items-center gap-1">
                      <ShieldCheck size={14} /> Đã lọc dị ứng: {data.restrictions.join(', ')}
                    </span>
                  )}
                </div>

                {/* KHU VỰC 2 CỘT: CỘT TRÁI (THÔNG TIN CALO) & CỘT PHẢI (CỜ CẢNH BÁO) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                  
                  {/* CỘT TRÁI (5 CỘT): KHỐI CAM HIGHLIGHT THÔNG TIN CALO */}
                  <div className="md:col-span-5 flex">
                    <div className="w-full bg-orange-50/80 border border-orange-200/80 p-4 px-5 rounded-2xl flex flex-col justify-center gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                          <Flame size={14} /> Target: {targetCalories} kcal
                        </span>
                        <span className={`text-xs font-bold ${isDeviationSoft ? 'text-orange-600' : 'text-emerald-600'}`}>
                          {caloPercentage}% mục tiêu ({caloDelta > 0 ? `+${caloDelta}` : caloDelta} kcal)
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2 pt-1 border-t border-orange-200/50">
                        <span className="text-xs font-bold uppercase text-slate-500">TỔNG CALO NGÀY:</span>
                        <span className="text-2xl font-black text-slate-900 font-mono">
                          {currentTotalCalories} <span className="text-xs font-bold text-slate-400">kcal</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CỘT PHẢI (7 CỘT): CỜ CẢNH BÁO (HIỂN THỊ KHI BỊ LỆCH NGUỠNG) */}
                  <div className="md:col-span-7 flex">
                    {isDeviationSoft ? (
                      <div className="w-full p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-bold text-amber-900">
                            Cờ: Thực đơn gần đúng (Lệch ngoài ngưỡng mềm ±10% Target)
                          </p>
                          <p className="text-amber-800 leading-relaxed text-xs">
                            Mức calo ngày chênh lệch {Math.abs(caloDelta)} kcal so với mục tiêu. Bạn có thể bấm "Đổi món" ở các bữa bên dưới để chọn suất ăn tương đương hơn hoặc xác nhận giữ lựa chọn này.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full p-4 bg-emerald-50/90 border border-emerald-200/90 rounded-2xl flex items-center gap-3 text-emerald-900 text-xs sm:text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <div>
                          <p className="font-bold">Thực đơn chuẩn xác</p>
                          <p className="text-emerald-800 text-xs">Mức calo ngày nằm hoàn toàn trong ngưỡng lý tưởng của bạn.</p>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* 3 Thanh Macro Ngày */}
                {currentPlan.nutrition && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                      <span>Phân bổ Macro ngày:</span>
                      <span className="font-mono">
                        P: {currentPlan.nutrition.protein}g | C: {currentPlan.nutrition.carb}g | F: {currentPlan.nutrition.fat}g
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-orange-50/80 p-3 rounded-xl border border-orange-100">
                        <p className="text-[10px] font-bold text-orange-800 uppercase">Đạm (Protein)</p>
                        <p className="text-lg font-black text-orange-600 font-mono">{currentPlan.nutrition.protein} g</p>
                      </div>
                      <div className="bg-amber-50/80 p-3 rounded-xl border border-amber-100">
                        <p className="text-[10px] font-bold text-amber-800 uppercase">Carb</p>
                        <p className="text-lg font-black text-amber-600 font-mono">{currentPlan.nutrition.carb} g</p>
                      </div>
                      <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-100">
                        <p className="text-[10px] font-bold text-blue-800 uppercase">Chất béo (Fat)</p>
                        <p className="text-lg font-black text-blue-600 font-mono">{currentPlan.nutrition.fat} g</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 BỮA ĂN TRONG NGÀY */}
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
                      className="bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 p-6 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="px-3 py-1 bg-slate-100/80 text-slate-800 rounded-full font-bold text-xs uppercase tracking-wider">
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
                          className="min-h-[40px] text-xs font-bold rounded-xl border-gray-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200"
                        >
                          <RefreshCw size={14} className="mr-1.5 text-orange-500" /> Đổi món (Swap)
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action: Thêm cả ngày vào giỏ hoặc Đặt cả tuần */}
              <div className="p-6 bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
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
                      className="w-full sm:w-auto min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 rounded-2xl shadow-lg shadow-orange-500/25 border-none"
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
                      className="w-full sm:w-auto min-h-[44px] bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold px-8 rounded-2xl shadow-xl shadow-orange-500/25 border-none"
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

      {/* Popover / Panel Đổi món */}
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

                      <Button size="sm" variant="outline" className="min-h-[36px] text-xs rounded-xl">
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
              <Button variant="outline" onClick={() => setShowModeConflictModal(false)} className="min-h-[44px] rounded-xl">
                Hủy bỏ
              </Button>
              <Button onClick={handleConfirmSwitchMode} className="min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl border-none">
                Xóa giỏ & Thêm mới
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}