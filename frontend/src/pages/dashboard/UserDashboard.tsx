import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Flame,
  Loader2,
  ClipboardList,
  Clock3,
  Bike,
  CheckCircle2,
  XCircle,
  Dumbbell
} from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type OrderStatus = 'Pending' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';

type UserOrder = {
  _id: string;
  status: OrderStatus;
  grandTotal: number;
  packageType: 'ONE_DAY' | 'WEEKLY_7D';
  items?: Array<{
    itemId?: string;
  }>;
  createdAt?: string;
  payment?: {
    method?: 'COD' | 'VNPay' | 'MoMo';
    status?: 'Pending' | 'Paid' | 'Failed';
  };
};

type RegisteredPTService = {
  _id: string;
  ptId?: string;
  title?: string;
  sessions?: number;
  price?: number;
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
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardWarning, setDashboardWarning] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [ptServices, setPTServices] = useState<RegisteredPTService[]>([]);

  const [todayStats, setTodayStats] = useState({
    consumedCalories: 0,
    targetCalories: 2000
  });

  const [calorieHistory, setCalorieHistory] = useState<any[]>([]);
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

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        setDashboardWarning(null);

        const [todayCalRes, historyCalRes, weightHistRes, profileRes, ordersRes, ptServicesRes] = await Promise.allSettled([
          api.get('/tracking/calories/today'),
          api.get('/tracking/calories'),
          api.get('/tracking/weight-history'),
          api.get('/users/me'),
          api.get('/orders'),
          api.get('/users/me/pt-services')
        ]);

        if (todayCalRes.status === 'fulfilled' && todayCalRes.value.data?.result) {
          const t = todayCalRes.value.data.result;
          setTodayStats({
            consumedCalories: t.caloriesConsumed || 0,
            targetCalories: t.targetCalories || 2000
          });
        }

        if (historyCalRes.status === 'fulfilled' && historyCalRes.value.data?.result) {
          const rawHistory = historyCalRes.value.data.result?.history;
          const history = Array.isArray(rawHistory)
            ? rawHistory.map((item: any) => ({
                date: item.date ? new Date(item.date).toLocaleDateString('vi-VN') : '',
                consumed: Number(item.caloriesConsumed || 0),
                burned: 0
              }))
            : [];
          setCalorieHistory(history);

          const target = Number(historyCalRes.value.data.result?.targetCalories || 0);
          if (target > 0) {
            setTodayStats((prev) => ({ ...prev, targetCalories: target }));
          }
        }

        if (weightHistRes.status === 'fulfilled' && weightHistRes.value.data?.result) {
          const rawWeights = weightHistRes.value.data.result;
          if (Array.isArray(rawWeights) && rawWeights.length > 0) {
            const start = Number(rawWeights[0]?.weightKg || 0);
            const current = Number(rawWeights[rawWeights.length - 1]?.weightKg || 0);
            setWeightMetrics({ startWeight: start, currentWeight: current });
          }
        }

        if (profileRes.status === 'fulfilled') {
          const me = profileRes.value.data?.result;
          setProfile(me || null);

          const healthProfile = me?.healthProfile;
          if (!healthProfile) {
            setDashboardWarning('Bạn chưa khai báo hồ sơ sức khỏe. Một số chỉ số mục tiêu sẽ hiển thị mặc định.');
          }
        }

        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data?.result)) {
          setOrders(ordersRes.value.data.result);
        }

        if (ptServicesRes.status === 'fulfilled') {
          const services = ptServicesRes.value.data?.result?.services;
          setPTServices(Array.isArray(services) ? services : []);
        }

      } catch (error) {
        console.error('Lỗi khi tải dữ liệu dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [refreshKey]);

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[#fafafa]">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  const remainingCalories = Math.max(0, todayStats.targetCalories - todayStats.consumedCalories);

  return (
    <div className="flex min-h-screen role-page-shell bg-[#fbf9f6]">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Tổng quan khách hàng" userRole="Người dùng" hideSearch={true} />
        
        <main className="p-8 space-y-6 overflow-y-auto min-w-0">
          {dashboardWarning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {dashboardWarning}
            </div>
          ) : null}

          {/* 1. THANH THIẾT LẬP HỒ SƠ DÀI TRẢI RỘNG TRÊN CÙNG (GIỐNG ẢNH 2) */}
          <div className="bg-[#fef2e8] p-6 rounded-[24px] border border-orange-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-orange-500 shadow-sm shrink-0">
                <ClipboardList size={24} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-base">Hiểu cơ thể bạn. Ăn uống đúng với bạn.</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {profile?.healthProfile 
                    ? 'Hồ sơ sức khỏe của bạn đã được khởi tạo.' 
                    : 'Bạn chưa có hồ sơ sức khỏe. Hãy thêm thể trạng và mục tiêu để bắt đầu.'}
                </p>
              </div>
            </div>
            <Link 
              to="/dashboard/health-survey" 
              className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl text-xs whitespace-nowrap transition-colors shadow-md shadow-orange-500/20"
            >
              Thiết lập hồ sơ →
            </Link>
          </div>

          {/* 2. KHU VỰC KHUNG GIỮA CHIA 2 CỘT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* CỘT TRÁI (2/3 MÀN HÌNH) */}
            <div className="lg:col-span-2 space-y-6 min-w-0">
              
              {/* 4 Card Chỉ số Thống kê */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">CALORIES TIÊU THỤ</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">{todayStats.consumedCalories.toLocaleString('vi-VN')} <span className="text-xs font-bold text-gray-400">kcal</span></p>
                  <p className="text-[10px] text-gray-400 mt-1">Chưa ghi nhận hôm nay</p>
                </article>

                <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">MỤC TIÊU CALORIES</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">{todayStats.targetCalories.toLocaleString('vi-VN')} <span className="text-xs font-bold text-gray-400">kcal</span></p>
                  <p className="text-[10px] text-gray-400 mt-1">Mục tiêu hiển thị tổng quan</p>
                </article>

                <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ĐƠN HÀNG ĐÃ ĐẶT</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">{orders.length}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Tổng đơn trong hệ thống</p>
                </article>

                <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">GÓI PT ĐÃ ĐĂNG KÝ</p>
                  <p className="text-2xl font-black text-gray-900 mt-2">{ptServices.length}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Gói huấn luyện cá nhân</p>
                </article>
              </section>

              {/* Theo dõi trạng thái đơn hàng */}
              <section className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-50 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClipboardList size={20} className="text-gray-900" />
                    <h2 className="text-base font-black text-gray-900">Theo dõi trạng thái đơn hàng</h2>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{orders.length} đơn hàng</span>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-2.5 text-xs font-semibold text-orange-800">
                  Đánh giá món ăn: mở trang{' '}
                  <Link to="/dashboard/menu" className="underline font-black hover:text-orange-900">
                    Thực đơn
                  </Link>{' '}
                  rồi bấm vào món để đánh giá.
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <StatusCard title="Chờ xử lý" value={countOrderByStatus(orders, 'Pending')} icon={<Clock3 size={16} className="text-amber-500" />} />
                  <StatusCard title="Đang nấu" value={countOrderByStatus(orders, 'Cooking')} icon={<Flame size={16} className="text-orange-500" />} />
                  <StatusCard title="Đang giao" value={countOrderByStatus(orders, 'Delivering')} icon={<Bike size={16} className="text-blue-500" />} />
                  <StatusCard title="Hoàn thành" value={countOrderByStatus(orders, 'Completed')} icon={<CheckCircle2 size={16} className="text-green-500" />} />
                  <StatusCard title="Đã hủy" value={countOrderByStatus(orders, 'Cancelled')} icon={<XCircle size={16} className="text-red-500" />} />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <th className="pb-3">Mã đơn</th>
                        <th className="pb-3">Ngày tạo</th>
                        <th className="pb-3">Gói</th>
                        <th className="pb-3">Thanh toán</th>
                        <th className="pb-3">Trạng thái</th>
                        <th className="pb-3 text-right">Tổng tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {recentOrders(orders).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs font-medium text-gray-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 text-lg">
                                📦
                              </div>
                              <p className="font-bold text-gray-700">Bạn chưa có đơn hàng nào</p>
                              <p className="text-[11px] text-gray-400">Khám phá thực đơn và chọn bữa ăn đầu tiên của bạn.</p>
                              <Link to="/dashboard/menu" className="mt-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl text-xs font-bold transition-colors">
                                Xem thực đơn
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        recentOrders(orders).map((order) => (
                          <tr key={order._id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-3 text-xs font-bold text-gray-900">#{order._id.slice(-8).toUpperCase()}</td>
                            <td className="py-3 text-xs text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('vi-VN') : 'N/A'}</td>
                            <td className="py-3 text-xs font-semibold text-gray-700">{order.packageType === 'WEEKLY_7D' ? 'Combo 7 ngày' : 'Một ngày'}</td>
                            <td className="py-3 text-xs text-gray-500">{order.payment?.method || 'N/A'}</td>
                            <td className="py-3">{renderStatusBadge(order.status)}</td>
                            <td className="py-3 text-xs font-black text-gray-900 text-right">{Number(order.grandTotal || 0).toLocaleString('vi-VN')} đ</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Dịch vụ PT */}
              {ptServices.length > 0 && (
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {ptServices.slice(0, 2).map((service) => (
                    <article key={service._id} className="bg-white p-4 rounded-[24px] shadow-sm border border-gray-50 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                        <Dumbbell size={20} className="text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Dịch vụ PT</p>
                        <p className="text-xs font-black text-gray-900 truncate mt-0.5">{service.title || 'Gói PT'}</p>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">{Number(service.sessions || 0)} buổi • {Number(service.price || 0).toLocaleString('vi-VN')} đ</p>
                      </div>
                    </article>
                  ))}
                </section>
              )}

            </div>

            {/* CỘT PHẢI (1/3 MÀN HÌNH) */}
            <div className="space-y-6 min-w-0">
              
              {/* Hồ sơ sức khỏe */}
              <section className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-50 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-gray-900">Hồ sơ sức khỏe</h2>
                  <Link to="/dashboard/health-survey" className="text-xs font-bold text-orange-600 hover:underline">
                    Chỉnh sửa
                  </Link>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 text-xs">
                    <span className="text-gray-400 font-medium">Tên hiển thị</span>
                    <span className="font-bold text-gray-900">{profile?.username || 'test1234'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 text-xs">
                    <span className="text-gray-400 font-medium">Mục tiêu</span>
                    <span className="font-bold text-gray-700">{mapGoalLabel(profile?.healthProfile?.goal)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50 text-xs">
                    <span className="text-gray-400 font-medium">Cân nặng</span>
                    <span className="font-bold text-gray-900">{weightMetrics.currentWeight || Number(profile?.healthProfile?.weightKg || 0)} kg</span>
                  </div>
                </div>

                {!profile?.healthProfile && (
                  <div className="bg-gray-50 p-3 rounded-2xl text-[11px] text-gray-400 text-center flex items-center justify-center gap-2">
                    <span>⚠️</span> Chưa khai báo hồ sơ sức khỏe
                  </div>
                )}
              </section>

              {/* Theo dõi Cân nặng */}
              <section className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-50 space-y-4">
                <h2 className="text-base font-black text-gray-900">Theo dõi cân nặng</h2>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Bắt đầu</span>
                    <span className="font-bold text-gray-900">{weightMetrics.startWeight} <span className="text-[10px] font-normal text-gray-400">kg</span></span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-gray-400 font-medium">Hiện tại</span>
                    <span className="font-black text-gray-900 text-sm">{weightMetrics.currentWeight} <span className="text-[10px] font-normal text-gray-400">kg</span></span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-400 font-medium">Mục tiêu</span>
                    <span className="font-bold text-gray-600">{mapGoalLabel(profile?.healthProfile?.goal)}</span>
                  </div>
                </div>
              </section>

            </div>

          </div>

          {/* 3. MỤC HOẠT ĐỘNG CALORIES ĐƯỢC KÉO DÀI 100% TRẢI RỘNG TRÊN CÙNG TRỤC VỚI THANH BÊN TRÊN */}
          <section className="bg-white p-6 rounded-[28px] shadow-sm border border-gray-50 space-y-4 w-full">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-gray-900">Hoạt động calories</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs font-bold text-gray-900">{remainingCalories.toLocaleString('vi-VN')} <span className="text-gray-400 font-normal">kcal còn lại</span></p>
                  <span className="text-xs text-gray-300">•</span>
                  <p className="text-xs text-gray-400 font-medium">Mục tiêu: {todayStats.targetCalories.toLocaleString()} kcal</p>
                </div>
              </div>
              <Link to="/dashboard/diary" className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline">
                Nhật ký thực phẩm →
              </Link>
            </div>

            <div className="h-[200px] w-full min-w-0 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calorieHistory} barGap={8}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }} dy={5} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 500 }} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="consumed" fill="#ffcc80" radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}

function countOrderByStatus(orders: UserOrder[], status: OrderStatus) {
  return orders.filter((order) => order.status === status).length;
}

function recentOrders(orders: UserOrder[]) {
  return [...orders]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 6);
}

function mapGoalLabel(goal?: 'LoseFat' | 'GainMuscle' | 'MaintainWeight') {
  if (goal === 'LoseFat') return 'Giảm mỡ';
  if (goal === 'GainMuscle') return 'Tăng cơ';
  if (goal === 'MaintainWeight') return 'Duy trì';
  return 'Chưa thiết lập';
}

function renderStatusBadge(status: OrderStatus) {
  const colorMap: Record<OrderStatus, string> = {
    Pending: 'bg-amber-50 text-amber-600',
    Cooking: 'bg-orange-50 text-orange-600',
    Delivering: 'bg-blue-50 text-blue-600',
    Completed: 'bg-green-50 text-green-600',
    Cancelled: 'bg-red-50 text-red-600'
  };

  const labelMap: Record<OrderStatus, string> = {
    Pending: 'Chờ xử lý',
    Cooking: 'Đang nấu',
    Delivering: 'Đang giao',
    Completed: 'Hoàn thành',
    Cancelled: 'Đã hủy'
  };

  return <span className={`px-3 py-1 rounded-lg text-[10px] font-bold ${colorMap[status]}`}>{labelMap[status]}</span>;
}

function StatusCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-gray-50 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
        {icon}
      </div>
      <p className="text-xl font-black text-gray-900 mt-1.5">{value}</p>
    </article>
  );
}