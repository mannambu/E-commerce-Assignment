import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar
} from 'recharts';
import { Loader2, DollarSign, Users, Megaphone, ShoppingBag } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type DashboardStats = {
  users: { customers: number; pts: number };
  products: { foods: number; ptServices: number };
  revenue: {
    overall: { totalAmount: number; completedOrders: number };
    thisMonth: { totalAmount: number; completedOrders: number };
    breakdown: {
      FOOD_ONE_DAY: { revenue: number; orders: number };
      COMBO_WEEKLY: { revenue: number; orders: number };
      OTHER: { revenue: number; orders: number };
    };
  };
};

type OrderItem = {
  _id: string;
  userId?: string;
  payment?: { method?: string };
  grandTotal?: number;
  createdAt?: string;
};

const defaultStats: DashboardStats = {
  users: { customers: 0, pts: 0 },
  products: { foods: 0, ptServices: 0 },
  revenue: {
    overall: { totalAmount: 0, completedOrders: 0 },
    thisMonth: { totalAmount: 0, completedOrders: 0 },
    breakdown: {
      FOOD_ONE_DAY: { revenue: 0, orders: 0 },
      COMBO_WEEKLY: { revenue: 0, orders: 0 },
      OTHER: { revenue: 0, orders: 0 }
    }
  }
};

export default function AdminDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setWarning(null);

        const [statsRes, ordersRes] = await Promise.allSettled([
          api.get('/admin/dashboard-stats'),
          api.get('/orders/all')
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value.data?.result) {
          setStats(statsRes.value.data.result);
        } else {
          setWarning('Không tải được thống kê tổng quan từ hệ thống.');
        }

        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value.data?.result)) {
          setOrders(ordersRes.value.data.result);
        }
      } catch (error) {
        console.error('Lỗi khi tải dashboard admin:', error);
        setWarning('Có lỗi xảy ra khi tải dữ liệu dashboard admin.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const money = (value: number) => `${Math.round(value || 0).toLocaleString('vi-VN')} đ`;

  const kpiData = useMemo(
    () => ({
      foodRevenue: Number(stats.revenue.breakdown.FOOD_ONE_DAY.revenue || 0),
      ptCommission: Number(stats.revenue.breakdown.COMBO_WEEKLY.revenue || 0),
      marketingCost: Number(stats.revenue.breakdown.OTHER.revenue || 0)
    }),
    [stats]
  );

  const profitData = useMemo(
    () => [
      { month: 'Tháng này', profit: Number(stats.revenue.thisMonth.totalAmount || 0) },
      { month: 'Tổng lũy kế', profit: Number(stats.revenue.overall.totalAmount || 0) }
    ],
    [stats]
  );

  const breakdownData = useMemo(
    () => [
      { name: 'Thực đơn lẻ', revenue: Number(stats.revenue.breakdown.FOOD_ONE_DAY.revenue || 0) },
      { name: 'Combo tuần', revenue: Number(stats.revenue.breakdown.COMBO_WEEKLY.revenue || 0) },
      { name: 'Khác', revenue: Number(stats.revenue.breakdown.OTHER.revenue || 0) }
    ],
    [stats]
  );

  const recentTransactions = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 6),
    [orders]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <Header title="Bảng quản trị hệ thống" />
        
        <main className="p-8 space-y-8 min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Doanh thu Thực đơn</p>
                  <h3 className="text-xl font-black text-gray-900 mt-1">{money(kpiData.foodRevenue)}</h3>
                </div>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Hoa hồng PT</p>
                  <h3 className="text-xl font-black text-gray-900 mt-1">{money(kpiData.ptCommission)}</h3>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-600">
                  <Megaphone size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Chi phí Marketing</p>
                  <h3 className="text-xl font-black text-gray-900 mt-1">{money(kpiData.marketingCost)}</h3>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 xl:col-span-2">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-black text-gray-900">Biểu đồ lợi nhuận</h2>
                  <p className="text-sm text-gray-400 font-medium">So sánh doanh thu tháng hiện tại và lũy kế</p>
              </div>
            </div>

              <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={profitData}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12, fontWeight: 600}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12, fontWeight: 600}} />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Area type="monotone" dataKey="profit" stroke="#f97316" strokeWidth={4} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Khách hàng</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{stats.users.customers}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">PT</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{stats.users.pts}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Món ăn hoạt động</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{stats.products.foods}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Gói PT hoạt động</p>
                  <p className="text-xl font-black text-gray-900 mt-1">{stats.products.ptServices}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-6">
                <ShoppingBag size={20} className="text-gray-900" />
                <h2 className="text-lg font-black text-gray-900">Cơ cấu doanh thu</h2>
              </div>

              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdownData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="revenue" fill="#f97316" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <h2 className="text-xl font-black text-gray-900">Giao dịch gần đây</h2>
              <p className="text-sm text-gray-400 font-medium">Lấy từ endpoint /orders/all</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentTransactions.length === 0 ? (
                <div className="col-span-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  Chưa có giao dịch nào để hiển thị.
                </div>
              ) : (
                recentTransactions.map((tnx) => (
                  <div key={tnx._id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-50 flex items-center justify-between hover:shadow-md transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center font-black text-xs">
                      {(tnx.userId || 'U').slice(-2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">Đơn hàng {tnx._id.slice(-6).toUpperCase()}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                          <span className="px-2 py-0.5 bg-gray-100 rounded-md text-[9px] font-black text-gray-500 uppercase">{tnx.payment?.method || 'N/A'}</span>
                          <span className="text-[10px] text-gray-400 font-medium">User: {tnx.userId || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right pr-4">
                      <p className="text-sm font-black text-gray-900">{money(Number(tnx.grandTotal || 0))}</p>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {tnx.createdAt ? new Date(tnx.createdAt).toLocaleString('vi-VN') : 'N/A'}
                      </p>
                  </div>
                </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}