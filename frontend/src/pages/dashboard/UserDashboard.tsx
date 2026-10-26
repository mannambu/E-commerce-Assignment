import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Flame,
  Loader2,
  ClipboardList,
  Clock3,
  Bike,
  CheckCircle2,
  XCircle,
  UserCircle,
  Eye,
  RotateCcw,
  AlertTriangle,
  X,
  MapPin,
  Calendar,
  Sparkles,
  ShoppingBag
} from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import { useCart } from '@/context/CartContext';
import { cn } from '@/lib/utils';

type OrderStatus = 'Pending' | 'Confirmed' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';

type OrderDelivery = {
  _id?: string;
  deliveryDate?: string;
  mealSlot?: string;
  status?: string;
  shipperId?: string;
};

type OrderStatusHistory = {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string;
  note?: string;
};

type UserOrder = {
  _id: string;
  status: OrderStatus;
  grandTotal: number;
  packageType: 'ONE_DAY' | 'WEEKLY_7D';
  version?: number;
  deliveryAddress?: string;
  deliveryDate?: string;
  note?: string;
  items?: Array<{
    itemId?: string;
    name?: string;
    price?: number;
    quantity?: number;
    image?: string;
  }>;
  deliveries?: OrderDelivery[];
  statusHistory?: OrderStatusHistory[];
  createdAt?: string;
  payment?: {
    method?: 'COD' | 'VNPay' | 'MoMo';
    status?: 'Pending' | 'Paid' | 'Failed';
  };
};

type UserProfile = {
  username?: string;
  healthProfile?: {
    goal?: 'LoseFat' | 'GainMuscle' | 'MaintainWeight';
    targetCalories?: number;
    weightKg?: number;
  };
};

export default function UserDashboard() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardWarning, setDashboardWarning] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<UserOrder | null>(null);

  // Cancellation Modal State
  const [cancelOrderTarget, setCancelOrderTarget] = useState<UserOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('Đổi kế hoạch ăn uống');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [cancelPreview, setCancelPreview] = useState<any>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [todayStats, setTodayStats] = useState({
    consumedCalories: 0,
    targetCalories: 2000
  });

  const [weightMetrics, setWeightMetrics] = useState({
    startWeight: 0,
    currentWeight: 0
  });

  useEffect(() => {
    const handleProfileUpdated = () => setRefreshKey((prev) => prev + 1);
    window.addEventListener('fitbite-profile-updated', handleProfileUpdated);

    return () => {
      window.removeEventListener('fitbite-profile-updated', handleProfileUpdated);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setDashboardWarning(null);

      const [todayCalRes, profileRes, ordersRes, weightHistRes] = await Promise.allSettled([
        api.get('/tracking/calories/today'),
        api.get('/users/me'),
        api.get('/orders'),
        api.get('/tracking/weight-history')
      ]);

      if (todayCalRes.status === 'fulfilled' && todayCalRes.value.data?.result) {
        const t = todayCalRes.value.data.result;
        setTodayStats({
          consumedCalories: t.caloriesConsumed || 0,
          targetCalories: t.targetCalories || 2000
        });
      }

      if (profileRes.status === 'fulfilled') {
        const me = profileRes.value.data?.result;
        setProfile(me || null);

        const healthProfile = me?.healthProfile;
        if (!healthProfile) {
          setDashboardWarning('Bạn chưa hoàn tất khảo sát hồ sơ sức khỏe. Hãy cập nhật để nhận thực đơn calo cá nhân hóa!');
        } else {
          const w = Number(healthProfile.weightKg || 0);
          setWeightMetrics({ startWeight: w, currentWeight: w });
        }
      }

      if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data?.result)) {
        setOrders(ordersRes.value.data.result);
      }

      if (weightHistRes.status === 'fulfilled' && Array.isArray(weightHistRes.value.data?.result)) {
        const wList = weightHistRes.value.data.result;
        if (wList.length > 0) {
          const start = Number(wList[0]?.weightKg || wList[0]?.weight || 0);
          const current = Number(wList[wList.length - 1]?.weightKg || wList[wList.length - 1]?.weight || 0);
          if (start > 0 && current > 0) {
            setWeightMetrics({ startWeight: start, currentWeight: current });
          }
        }
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu dashboard:', error);
      setDashboardWarning('Không thể tải dữ liệu mới nhất. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshKey]);

  // Open cancellation modal
  const handleOpenCancelModal = async (order: UserOrder) => {
    setCancelOrderTarget(order);
    setCancelError(null);
    setCancelPreview(null);
    try {
      const res = await api.get(`/orders/${order._id}/cancellation`);
      setCancelPreview(res.data?.result || null);
    } catch (err: any) {
      console.warn('Preview cancellation not available, fallback to direct confirm');
    }
  };

  // Submit cancellation
  const handleConfirmCancel = async () => {
    if (!cancelOrderTarget) return;

    const finalReason =
      cancelReason === 'Khác' ? customCancelReason.trim() : cancelReason;

    if (!finalReason) {
      setCancelError('Vui lòng nêu lý do hủy đơn hàng.');
      return;
    }

    try {
      setIsCancelling(true);
      setCancelError(null);

      await api.post(`/orders/${cancelOrderTarget._id}/cancellation-requests`, {
        version: cancelOrderTarget.version ?? 0,
        reason: finalReason
      });

      setCancelOrderTarget(null);
      await fetchDashboardData();
    } catch (err: any) {
      setCancelError(err?.response?.data?.message || 'Không thể hủy đơn hàng lúc này.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Re-order handler
  const handleReOrder = async (order: UserOrder) => {
    if (!order.items || order.items.length === 0) {
      navigate('/food-catalog');
      return;
    }

    for (const it of order.items) {
      if (it.itemId) {
        await addItem(
          {
            id: it.itemId,
            name: it.name || 'Món ăn',
            price: it.price || 0,
            image: it.image || 'https://picsum.photos/seed/food/200/200'
          },
          it.quantity || 1
        );
      }
    }
    navigate('/cart');
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[#fafafa]">
        <Sidebar role="user" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  const activeOrdersCount = orders.filter((o) =>
    ['Pending', 'Confirmed', 'Cooking', 'Delivering'].includes(o.status)
  ).length;

  return (
    <div className="flex min-h-screen bg-[#faf8f5] relative overflow-hidden">
      
      {/* ========================================================= */}
      {/* BACKGROUND WAVES */}
      {/* ========================================================= */}
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg
          className="w-full h-full"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="dash-wave-orange" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a44" />
              <stop offset="100%" stopColor="#fc6076" />
            </linearGradient>
            <linearGradient id="dash-wave-mint" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#80d0c7" />
              <stop offset="100%" stopColor="#0093e9" />
            </linearGradient>
            <linearGradient id="dash-wave-blue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#74ebd5" />
              <stop offset="100%" stopColor="#9aceff" />
            </linearGradient>
            <linearGradient id="dash-wave-pink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a9e" />
              <stop offset="100%" stopColor="#fecfef" />
            </linearGradient>
          </defs>

          <path
            d="M-100,-50 C300,100 450,280 150,450 C-100,550 -200,300 -100,-50 Z"
            fill="url(#dash-wave-orange)"
            className="opacity-20 blur-3xl"
          />
          <path
            d="M800,-100 C1100,50 1550,150 1550,400 C1300,450 950,250 800,-100 Z"
            fill="url(#dash-wave-mint)"
            className="opacity-15 blur-3xl"
          />
          <path
            d="M-150,550 C200,450 450,700 250,950 C0,1050 -150,850 -150,550 Z"
            fill="url(#dash-wave-blue)"
            className="opacity-15 blur-3xl"
          />
          <path
            d="M900,500 C1250,550 1600,700 1500,1000 C1100,1000 850,750 900,500 Z"
            fill="url(#dash-wave-pink)"
            className="opacity-20 blur-3xl"
          />
        </svg>
      </div>

      <Sidebar role="user" />

      <div className="flex-1 flex flex-col min-w-0 z-10">
        <Header title="Tổng quan khách hàng" userRole="Người dùng" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {dashboardWarning && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 backdrop-blur-md px-5 py-4 text-sm font-semibold text-amber-800 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                <span>{dashboardWarning}</span>
              </div>
              <Link to="/health-survey">
                <Button size="sm" className="rounded-xl text-xs bg-amber-600 hover:bg-amber-700 text-white">
                  Làm khảo sát ngay
                </Button>
              </Link>
            </div>
          )}

          {/* Quick Metrics */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white/90 backdrop-blur-md p-6 rounded-[28px] shadow-xs border border-white/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Calories hôm nay</p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {todayStats.consumedCalories.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs font-bold text-gray-400">kcal</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
                <Flame size={24} />
              </div>
            </article>

            <article className="bg-white/90 backdrop-blur-md p-6 rounded-[28px] shadow-xs border border-white/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mục tiêu Calories</p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {todayStats.targetCalories.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs font-bold text-gray-400">kcal / ngày</span>
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                <Sparkles size={24} />
              </div>
            </article>

            <article className="bg-white/90 backdrop-blur-md p-6 rounded-[28px] shadow-xs border border-white/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Đơn hàng đang xử lý</p>
                <p className="text-3xl font-black text-gray-900 mt-2">{activeOrdersCount} đơn</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                <ShoppingBag size={24} />
              </div>
            </article>
          </section>

          {/* Health Profile Overview */}
          <section className="bg-white/90 backdrop-blur-md p-8 rounded-[32px] shadow-xs border border-white/80 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCircle size={26} className="text-gray-900" />
                <h2 className="text-xl font-black text-gray-900">Hồ sơ sức khỏe của bạn</h2>
              </div>
              <Link to="/health-survey">
                <Button variant="outline" className="rounded-xl text-sm font-bold px-4 py-2 h-auto border-gray-200">
                  Cập nhật chỉ số
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-gray-50/70 p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Khách hàng</p>
                <p className="text-lg font-black text-gray-900 mt-1">{profile?.username || 'Khách hàng FitBite'}</p>
              </div>
              <div className="rounded-2xl bg-gray-50/70 p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mục tiêu thể hình</p>
                <p className="text-lg font-black text-gray-900 mt-1">
                  {mapGoalLabel(profile?.healthProfile?.goal)}
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50/70 p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cân nặng hiện tại</p>
                <p className="text-lg font-black text-gray-900 mt-1">
                  {weightMetrics.currentWeight || Number(profile?.healthProfile?.weightKg || 0)} kg
                </p>
              </div>
            </div>
          </section>

          {/* Orders Tracking Section */}
          <section className="bg-white/90 backdrop-blur-md p-8 rounded-[32px] shadow-xs border border-white/80 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <ClipboardList size={26} className="text-gray-900" />
                <div>
                  <h2 className="text-xl font-black text-gray-900">Quản lý & Theo dõi đơn hàng</h2>
                  <p className="text-sm font-medium text-gray-500 mt-0.5">
                    Theo dõi hành trình chuẩn bị và giao món từng ngày
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={fetchDashboardData}
                className="rounded-xl text-sm font-bold px-4 py-2 h-auto border-gray-200 self-start sm:self-auto"
              >
                <RotateCcw size={16} className="mr-2" /> Làm mới
              </Button>
            </div>

            {/* Status Counters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatusCard
                title="Chờ xử lý"
                value={countOrderByStatus(orders, 'Pending')}
                icon={<Clock3 size={18} className="text-amber-500" />}
              />
              <StatusCard
                title="Đang nấu"
                value={countOrderByStatus(orders, 'Cooking')}
                icon={<Flame size={18} className="text-orange-500" />}
              />
              <StatusCard
                title="Đang giao"
                value={countOrderByStatus(orders, 'Delivering')}
                icon={<Bike size={18} className="text-blue-500" />}
              />
              <StatusCard
                title="Hoàn thành"
                value={countOrderByStatus(orders, 'Completed')}
                icon={<CheckCircle2 size={18} className="text-green-500" />}
              />
              <StatusCard
                title="Đã hủy"
                value={countOrderByStatus(orders, 'Cancelled')}
                icon={<XCircle size={18} className="text-red-500" />}
              />
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-4">Mã đơn</th>
                    <th className="pb-4">Ngày tạo</th>
                    <th className="pb-4">Loại gói</th>
                    <th className="pb-4">Thanh toán</th>
                    <th className="pb-4">Trạng thái</th>
                    <th className="pb-4">Tổng tiền</th>
                    <th className="pb-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm font-medium text-gray-500">
                        <ShoppingBag size={32} className="mx-auto text-gray-300 mb-2" />
                        Bạn chưa có đơn hàng nào. Hãy khám phá thực đơn FitBite ngay!
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => {
                      const canCancel = ['Pending', 'Confirmed'].includes(order.status);
                      const isCompleted = order.status === 'Completed';
                      const isCancelled = order.status === 'Cancelled';

                      return (
                        <tr key={order._id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="py-4 text-sm font-black text-gray-900">
                            #{order._id.slice(-8).toUpperCase()}
                          </td>
                          <td className="py-4 text-xs text-gray-500">
                            {order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : 'N/A'}
                          </td>
                          <td className="py-4 text-xs font-bold text-gray-700">
                            {order.packageType === 'WEEKLY_7D' ? (
                              <span className="text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">Combo tuần</span>
                            ) : (
                              <span className="text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">Món 1 ngày</span>
                            )}
                          </td>
                          <td className="py-4 text-xs text-gray-600">
                            {order.payment?.method || 'COD'} ({order.payment?.status || 'Chờ thu'})
                          </td>
                          <td className="py-4">{renderStatusBadge(order.status)}</td>
                          <td className="py-4 text-sm font-black text-gray-900">
                            {Number(order.grandTotal || 0).toLocaleString('vi-VN')}đ
                          </td>
                          <td className="py-4 text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedOrder(order)}
                              className="rounded-xl text-xs h-8 px-3"
                            >
                              <Eye size={13} className="mr-1" /> Chi tiết
                            </Button>

                            {canCancel && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenCancelModal(order)}
                                className="rounded-xl text-xs h-8 px-3 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                Hủy đơn
                              </Button>
                            )}

                            {(isCompleted || isCancelled) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReOrder(order)}
                                className="rounded-xl text-xs h-8 px-3 text-orange-600 border-orange-200 hover:bg-orange-50"
                              >
                                Đặt lại
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  Chi tiết đơn hàng #{selectedOrder._id.slice(-8).toUpperCase()}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Tạo lúc: {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString('vi-VN') : 'N/A'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Delivery address & note */}
            <div className="p-4 rounded-2xl bg-gray-50 space-y-2 text-sm">
              <p className="flex items-start gap-2 text-gray-700">
                <MapPin size={16} className="text-orange-500 mt-0.5 shrink-0" />
                <span>
                  <strong>Địa chỉ giao:</strong> {selectedOrder.deliveryAddress || 'N/A'}
                </span>
              </p>
              {selectedOrder.note && (
                <p className="text-xs text-gray-500 pl-6">Ghi chú: {selectedOrder.note}</p>
              )}
            </div>

            {/* Status and Package Info */}
            <div className="flex items-center justify-between p-4 rounded-2xl border border-gray-100">
              <div>
                <p className="text-xs text-gray-400 font-bold uppercase">Trạng thái hiện tại</p>
                <div className="mt-1">{renderStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 font-bold uppercase">Tổng thanh toán</p>
                <p className="text-lg font-black text-orange-600">
                  {Number(selectedOrder.grandTotal || 0).toLocaleString('vi-VN')}đ
                </p>
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wide">Món ăn trong đơn</h4>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl p-2">
                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image || 'https://picsum.photos/seed/item/100/100'}
                          alt={item.name || 'Món'}
                          className="w-12 h-12 rounded-xl object-cover border border-gray-100"
                        />
                        <div>
                          <p className="font-bold text-sm text-gray-900">{item.name || 'Món ăn FitBite'}</p>
                          <p className="text-xs text-gray-500">
                            Số lượng: {item.quantity || 1} x {Number(item.price || 0).toLocaleString('vi-VN')}đ
                          </p>
                        </div>
                      </div>

                      {selectedOrder.status === 'Completed' && item.itemId && (
                        <Link
                          to={`/food/${item.itemId}#review`}
                          className="text-xs font-bold text-orange-600 hover:underline"
                        >
                          Đánh giá món
                        </Link>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-xs text-gray-400 text-center">Không có danh sách món chi tiết.</p>
                )}
              </div>
            </div>

            {/* Weekly Deliveries (if COMBO / Weekly) */}
            {selectedOrder.deliveries && selectedOrder.deliveries.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wide">
                  Lịch trình các đợt giao ({selectedOrder.deliveries.length} lượt)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedOrder.deliveries.map((del, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="font-bold">
                          {del.deliveryDate ? new Date(del.deliveryDate).toLocaleDateString('vi-VN') : `Lượt ${idx + 1}`}
                        </span>
                      </div>
                      <span className="font-bold text-orange-600">{del.status || 'Chờ giao'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedOrder(null)} className="rounded-xl px-6">
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancelOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <AlertTriangle size={22} className="text-red-500" /> Xác nhận hủy đơn hàng
              </h3>
              <button
                type="button"
                onClick={() => setCancelOrderTarget(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Bạn có chắc chắn muốn hủy đơn hàng #{cancelOrderTarget._id.slice(-8).toUpperCase()}?
            </p>

            {cancelPreview ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-bold">Chính sách hủy đơn:</p>
                <p>
                  Phương thức: <strong>{cancelOrderTarget.payment?.method || 'COD'}</strong>
                </p>
                <p>Đơn hàng COD chưa thanh toán sẽ được hủy ngay và không phát sinh phí.</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Lý do hủy đơn:
              </label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                <option value="Đổi kế hoạch ăn uống">Đổi kế hoạch ăn uống</option>
                <option value="Đặt nhầm món / địa chỉ">Đặt nhầm món hoặc địa chỉ giao</option>
                <option value="Muốn thay đổi phương thức thanh toán">Muốn đổi phương thức thanh toán</option>
                <option value="Khác">Lý do khác...</option>
              </select>

              {cancelReason === 'Khác' && (
                <textarea
                  value={customCancelReason}
                  onChange={(e) => setCustomCancelReason(e.target.value)}
                  placeholder="Nhập chi tiết lý do của bạn..."
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              )}
            </div>

            {cancelError && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
                {cancelError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setCancelOrderTarget(null)}
                className="rounded-xl px-5 text-sm"
              >
                Đóng
              </Button>
              <Button
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="rounded-xl px-5 text-sm bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? 'Đang hủy...' : 'Xác nhận hủy đơn'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function countOrderByStatus(orders: UserOrder[], status: OrderStatus) {
  return orders.filter((order) => order.status === status).length;
}

function mapGoalLabel(goal?: 'LoseFat' | 'GainMuscle' | 'MaintainWeight') {
  if (goal === 'LoseFat') return 'Giảm mỡ (LoseFat)';
  if (goal === 'GainMuscle') return 'Tăng cơ (GainMuscle)';
  if (goal === 'MaintainWeight') return 'Duy trì cân nặng';
  return 'Chưa thiết lập';
}

function renderStatusBadge(status: OrderStatus) {
  switch (status) {
    case 'Pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock3 size={14} className="text-amber-500" /> Chờ xử lý
        </span>
      );
    case 'Confirmed':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
          <CheckCircle2 size={14} className="text-teal-500" /> Đã xác nhận
        </span>
      );
    case 'Cooking':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
          <Flame size={14} className="text-orange-500" /> Đang nấu
        </span>
      );
    case 'Delivering':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <Bike size={14} className="text-blue-500" /> Đang giao
        </span>
      );
    case 'Completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 size={14} className="text-green-500" /> Hoàn thành
        </span>
      );
    case 'Cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
          <XCircle size={14} className="text-red-500" /> Đã hủy
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
          {status}
        </span>
      );
  }
}

function StatusCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
    </article>
  );
}