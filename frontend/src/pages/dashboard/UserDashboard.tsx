import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import {
  Flame,
  Loader2,
  ClipboardList,
  Clock3,
  Bike,
  CheckCircle2,
  XCircle,
  UserCircle,
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
  const [weightHistory, setWeightHistory] = useState<any[]>([]);
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
          const weights = Array.isArray(rawWeights)
            ? rawWeights.map((item: any) => ({
                date: item.date ? new Date(item.date).toLocaleDateString('vi-VN') : '',
                weight: Number(item.weightKg || 0)
              }))
            : [];
          setWeightHistory(weights);

          if (weights.length > 0) {
            const start = Number(weights[0]?.weight || 0);
            const current = Number(weights[weights.length - 1]?.weight || 0);
            setWeightMetrics({ startWeight: start, currentWeight: current });
          }
        }

        if (profileRes.status === 'fulfilled') {
          const me = profileRes.value.data?.result;
          setProfile(me || null);

          const healthProfile = me?.healthProfile;
          if (!healthProfile) {
            setDashboardWarning('Bạn chưa khai báo hồ sơ sức khỏe. Một số chỉ số mục tiêu sẽ hiển thị mặc định.');
          } else if (weightHistory.length === 0) {
            const currentWeight = Number(healthProfile.weightKg || 0);
            setWeightMetrics({ startWeight: currentWeight, currentWeight });
          }
        } else {
          console.error('Lỗi tải hồ sơ người dùng:', profileRes.reason);
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

  // Tính lượng Calo còn lại có thể ăn trong ngày
  const remainingCalories = Math.max(0, todayStats.targetCalories - todayStats.consumedCalories);

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Tổng quan khách hàng" userRole="Người dùng" hideSearch={true} />
        
        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {dashboardWarning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {dashboardWarning}
            </div>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Calories hôm nay</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{todayStats.consumedCalories.toLocaleString('vi-VN')} <span className="text-xs font-bold text-gray-400">kcal</span></p>
            </article>
            <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mục tiêu calories</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{todayStats.targetCalories.toLocaleString('vi-VN')} <span className="text-xs font-bold text-gray-400">kcal</span></p>
            </article>
            <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Đơn đang xử lý</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{orders.filter((order) => ['Pending', 'Cooking', 'Delivering'].includes(order.status)).length}</p>
            </article>
            <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Gói PT đã đăng ký</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{ptServices.length}</p>
            </article>
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center gap-3">
              <UserCircle size={24} className="text-gray-900" />
              <h2 className="text-xl font-black text-gray-900">Hồ sơ sức khỏe</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Người dùng</p>
                <p className="text-lg font-black text-gray-900 mt-1">{profile?.username || 'N/A'}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mục tiêu</p>
                <p className="text-lg font-black text-gray-900 mt-1">{mapGoalLabel(profile?.healthProfile?.goal)}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cân nặng hiện tại</p>
                <p className="text-lg font-black text-gray-900 mt-1">{weightMetrics.currentWeight || Number(profile?.healthProfile?.weightKg || 0)} kg</p>
              </div>
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center gap-3">
              <ClipboardList size={24} className="text-gray-900" />
              <h2 className="text-xl font-black text-gray-900">Theo dõi trạng thái đơn hàng</h2>
            </div>

            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
              Đánh giá món ăn: mở trang
              {' '}
              <Link to="/dashboard/menu" className="underline font-black hover:text-orange-900">
                Thực đơn
              </Link>
              {' '}
              rồi bấm vào món để vào phần đánh giá.
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatusCard title="Chờ xử lý" value={countOrderByStatus(orders, 'Pending')} icon={<Clock3 size={16} className="text-amber-500" />} />
              <StatusCard title="Đang nấu" value={countOrderByStatus(orders, 'Cooking')} icon={<Flame size={16} className="text-orange-500" />} />
              <StatusCard title="Đang giao" value={countOrderByStatus(orders, 'Delivering')} icon={<Bike size={16} className="text-blue-500" />} />
              <StatusCard title="Hoàn thành" value={countOrderByStatus(orders, 'Completed')} icon={<CheckCircle2 size={16} className="text-green-500" />} />
              <StatusCard title="Đã hủy" value={countOrderByStatus(orders, 'Cancelled')} icon={<XCircle size={16} className="text-red-500" />} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-4">Mã đơn</th>
                    <th className="pb-4">Ngày tạo</th>
                    <th className="pb-4">Gói</th>
                    <th className="pb-4">Thanh toán</th>
                    <th className="pb-4">Trạng thái</th>
                    <th className="pb-4">Đánh giá</th>
                    <th className="pb-4 text-right">Tổng tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders(orders).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-sm font-medium text-gray-500">Bạn chưa có đơn hàng nào.</td>
                    </tr>
                  ) : (
                    recentOrders(orders).map((order) => (
                      <tr key={order._id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-4 text-sm font-bold text-gray-900">#{order._id.slice(-8).toUpperCase()}</td>
                        <td className="py-4 text-sm text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : 'N/A'}</td>
                        <td className="py-4 text-sm font-semibold text-gray-700">{order.packageType === 'WEEKLY_7D' ? 'Combo 7 ngày' : 'Một ngày'}</td>
                        <td className="py-4 text-sm text-gray-500">{order.payment?.method || 'N/A'} ({order.payment?.status || 'N/A'})</td>
                        <td className="py-4">{renderStatusBadge(order.status)}</td>
                        <td className="py-4 text-sm">
                          {order.status === 'Completed' ? (
                            (() => {
                              const uniqueItemIds = Array.from(
                                new Set((order.items || []).map((item) => String(item.itemId || '')).filter(Boolean))
                              );

                              if (uniqueItemIds.length === 0) {
                                return <span className="text-gray-400">Không có món để đánh giá</span>;
                              }

                              return (
                                <Link
                                  to={`/food/${uniqueItemIds[0]}#review`}
                                  className="font-bold text-orange-600 hover:text-orange-700 underline"
                                >
                                  Đánh giá ngay
                                </Link>
                              );
                            })()
                          ) : (
                            <span className="text-gray-400">Chờ hoàn thành</span>
                          )}
                        </td>
                        <td className="py-4 text-sm font-black text-gray-900 text-right">{Number(order.grandTotal || 0).toLocaleString('vi-VN')} đ</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ptServices.slice(0, 4).map((service) => (
              <article key={service._id} className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Dumbbell size={22} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider truncate">Dịch vụ PT</p>
                  <p className="text-sm font-black text-gray-900 truncate mt-1">{service.title || 'Gói PT'}</p>
                  <p className="text-[11px] font-semibold text-gray-500 mt-1">{Number(service.sessions || 0)} buổi • {Number(service.price || 0).toLocaleString('vi-VN')} đ</p>
                  {service.ptId ? (
                    <Link to={`/pt/${service.ptId}`} className="mt-2 inline-flex text-[11px] font-bold text-orange-600 hover:text-orange-700">
                      Đánh giá PT
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-gray-900">Hoạt động Calories</h2>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-sm font-bold text-gray-900">{remainingCalories.toLocaleString('vi-VN')} <span className="text-gray-400 font-medium">kcal còn lại</span></p>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Mục tiêu: {todayStats.targetCalories.toLocaleString()} kcal</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#ffcc80]" />
                  <span className="text-gray-400">Đã nạp</span>
                </div>
              </div>
            </div>

            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calorieHistory} barGap={8}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 500 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 500 }} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="consumed" fill="#ffcc80" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">Theo dõi Cân nặng</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cân nặng bắt đầu</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{weightMetrics.startWeight} <span className="text-sm font-bold text-gray-400">Kg</span></p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cân nặng hiện tại</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{weightMetrics.currentWeight} <span className="text-sm font-bold text-gray-400">Kg</span></p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mục tiêu hiện tại</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{mapGoalLabel(profile?.healthProfile?.goal)}</p>
                </div>
              </div>

              <div className="md:col-span-3 h-[250px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightHistory}>
                    <defs>
                      <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffcc80" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ffcc80" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12, fontWeight: 500 }} dy={10} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Area type="monotone" dataKey="weight" stroke="#ffcc80" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" dot={{ r: 4, fill: '#ffcc80', strokeWidth: 2, stroke: '#fff' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
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
    <article className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
        {icon}
      </div>
      <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
    </article>
  );
}