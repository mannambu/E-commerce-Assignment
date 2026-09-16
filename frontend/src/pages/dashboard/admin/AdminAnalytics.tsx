import { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { Users, ShoppingBag, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { cn } from '@/lib/utils';
import api from '@/services/api';

type AdminUser = {
  _id: string;
  created_at?: string;
  createdAt?: string;
};

type AdminFood = {
  _id: string;
  name: string;
};

type AdminOrder = {
  _id: string;
  createdAt?: string;
  status?: 'Pending' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';
  shippingFee?: number;
  items?: Array<{
    itemId?: string;
    quantity?: number;
  }>;
};

type DashboardStats = {
  users?: {
    customers?: number;
    pts?: number;
  };
  revenue?: {
    overall?: {
      totalAmount?: number;
      completedOrders?: number;
    };
    thisMonth?: {
      totalAmount?: number;
      completedOrders?: number;
    };
    breakdown?: {
      FOOD_ONE_DAY?: {
        revenue?: number;
        orders?: number;
      };
      COMBO_WEEKLY?: {
        revenue?: number;
        orders?: number;
      };
      OTHER?: {
        revenue?: number;
        orders?: number;
      };
    };
  };
};

type AcquisitionPoint = {
  name: string;
  users: number;
};

type TopSeller = {
  name: string;
  sales: number;
  growth: string;
  color: string;
};

const sellerColors = ['#c1e06d', '#ff9f59', '#3b82f6', '#ef4444', '#06b6d4'];

function atStartOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function percentageChange(current: number, previous: number): number {
  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

function formatGrowth(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

export default function AdminAnalytics() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [acquisitionData, setAcquisitionData] = useState<AcquisitionPoint[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [newUsersThisWeek, setNewUsersThisWeek] = useState(0);
  const [newUsersGrowth, setNewUsersGrowth] = useState(0);
  const [mealsSoldThisWeek, setMealsSoldThisWeek] = useState(0);
  const [mealsGrowth, setMealsGrowth] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        setWarning(null);

        const [statsRes, ordersRes, usersRes, foodsRes] = await Promise.all([
          api.get('/admin/dashboard-stats'),
          api.get('/orders/all'),
          api.get('/users'),
          api.get('/foods?page=1&limit=500&sortBy=createdAt&order=desc')
        ]);

        const dashboardStats: DashboardStats = statsRes.data?.result || {};
        const orders: AdminOrder[] = Array.isArray(ordersRes.data?.result) ? ordersRes.data.result : [];
        const users: AdminUser[] = Array.isArray(usersRes.data?.result) ? usersRes.data.result : [];
        const foods: AdminFood[] = Array.isArray(foodsRes.data?.result?.foods) ? foodsRes.data.result.foods : [];

        setStats(dashboardStats);

        const now = new Date();
        const today = atStartOfDay(now);

        const currentStart = new Date(today);
        currentStart.setDate(today.getDate() - 6);

        const previousStart = new Date(currentStart);
        previousStart.setDate(currentStart.getDate() - 7);

        const previousEnd = new Date(currentStart);
        previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);

        const dayLabels: AcquisitionPoint[] = [];
        for (let i = 0; i < 7; i += 1) {
          const date = new Date(currentStart);
          date.setDate(currentStart.getDate() + i);
          dayLabels.push({
            name: date.toLocaleDateString('vi-VN', { weekday: 'short' }),
            users: 0
          });
        }

        let currentUsers = 0;
        let previousUsers = 0;

        for (const user of users) {
          const createdRaw = user.created_at || user.createdAt;
          if (!createdRaw) continue;
          const createdAt = new Date(createdRaw);
          if (Number.isNaN(createdAt.getTime())) continue;

          if (createdAt >= currentStart && createdAt <= now) {
            currentUsers += 1;
            const dayIndex = Math.floor((atStartOfDay(createdAt).getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000));
            if (dayIndex >= 0 && dayIndex < dayLabels.length) {
              dayLabels[dayIndex].users += 1;
            }
          } else if (createdAt >= previousStart && createdAt <= previousEnd) {
            previousUsers += 1;
          }
        }

        setAcquisitionData(dayLabels);
        setNewUsersThisWeek(currentUsers);
        setNewUsersGrowth(percentageChange(currentUsers, previousUsers));

        let mealsCurrent = 0;
        let mealsPrevious = 0;
        const currentSalesByFood = new Map<string, number>();
        const previousSalesByFood = new Map<string, number>();

        for (const order of orders) {
          if (order.status !== 'Completed') continue;
          const createdAt = new Date(order.createdAt || 0);
          if (Number.isNaN(createdAt.getTime())) continue;

          const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

          if (createdAt >= currentStart && createdAt <= now) {
            mealsCurrent += quantity;
            for (const item of order.items || []) {
              const key = String(item.itemId || 'unknown');
              currentSalesByFood.set(key, (currentSalesByFood.get(key) || 0) + Number(item.quantity || 0));
            }
          } else if (createdAt >= previousStart && createdAt <= previousEnd) {
            mealsPrevious += quantity;
            for (const item of order.items || []) {
              const key = String(item.itemId || 'unknown');
              previousSalesByFood.set(key, (previousSalesByFood.get(key) || 0) + Number(item.quantity || 0));
            }
          }
        }

        setMealsSoldThisWeek(mealsCurrent);
        setMealsGrowth(percentageChange(mealsCurrent, mealsPrevious));

        const foodNameMap = new Map<string, string>();
        for (const food of foods) {
          foodNameMap.set(String(food._id), food.name || `Món ${String(food._id).slice(-6)}`);
        }

        const sellerList = Array.from(currentSalesByFood.entries())
          .map(([foodId, sales], idx) => {
            const previous = previousSalesByFood.get(foodId) || 0;
            return {
              name: foodNameMap.get(foodId) || `Món ${foodId.slice(-6)}`,
              sales,
              growth: formatGrowth(percentageChange(sales, previous)),
              color: sellerColors[idx % sellerColors.length]
            };
          })
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5)
          .map((item, idx) => ({ ...item, color: sellerColors[idx % sellerColors.length] }));

        setTopSellers(sellerList);
      } catch (error: any) {
        console.error('Lỗi tải dữ liệu:', error);
        setWarning(error?.response?.data?.message || 'Không thể tải dữ liệu thống kê admin.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const revenueBreakdownChart = useMemo(() => {
    const breakdown = stats?.revenue?.breakdown;
    return [
      {
        name: 'Food one day',
        value: Number(breakdown?.FOOD_ONE_DAY?.revenue || 0),
        color: '#c1e06d'
      },
      {
        name: 'Combo weekly',
        value: Number(breakdown?.COMBO_WEEKLY?.revenue || 0),
        color: '#ff9f59'
      },
      {
        name: 'Other',
        value: Number(breakdown?.OTHER?.revenue || 0),
        color: '#60a5fa'
      }
    ];
  }, [stats]);

  const showUpUsers = newUsersGrowth >= 0;
  const showUpMeals = mealsGrowth >= 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar role="admin" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Báo cáo Thống kê" userRole="Quản trị viên" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Người dùng mới (7 ngày)</p>
                <h3 className="text-4xl font-black text-gray-900">{newUsersThisWeek.toLocaleString('vi-VN')}</h3>
                <div className={cn('flex items-center gap-2 font-bold text-sm', showUpUsers ? 'text-green-500' : 'text-red-500')}>
                  {showUpUsers ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  <span>{formatGrowth(newUsersGrowth)} so với 7 ngày trước </span>
                </div>
              </div>
              <div className="w-16 h-16 bg-blue-50 rounded-3xl flex items-center justify-center text-blue-500">
                <Users size={32} />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tổng suất ăn đã bán (7 ngày)</p>
                <h3 className="text-4xl font-black text-gray-900">{mealsSoldThisWeek.toLocaleString('vi-VN')}</h3>
                <div className={cn('flex items-center gap-2 font-bold text-sm', showUpMeals ? 'text-green-500' : 'text-red-500')}>
                  {showUpMeals ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  <span>{formatGrowth(mealsGrowth)} so với 7 ngày trước </span>
                </div>
              </div>
              <div className="w-16 h-16 bg-orange-50 rounded-3xl flex items-center justify-center text-orange-500">
                <ShoppingBag size={32} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
              <div>
                <h2 className="text-xl font-black text-gray-900">Tăng trưởng người dùng</h2>
                <p className="text-xs text-gray-400 font-medium mt-1">Số đăng ký mới theo từng ngày trong 7 ngày gần nhất</p>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={acquisitionData}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="users" radius={[10, 10, 0, 0]} barSize={40}>
                      {acquisitionData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={index === acquisitionData.length - 1 ? '#c1e06d' : '#e5e7eb'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
              <h2 className="text-xl font-black text-gray-900">Top 5 bán chạy</h2>

              <div className="space-y-4">
                {topSellers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 text-center">
                    Chưa đủ dữ liệu để xếp hạng.
                  </div>
                ) : (
                  topSellers.map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                          style={{ backgroundColor: item.color }}
                        >
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{item.sales} suất</p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          'text-[10px] font-black px-2 py-1 rounded-lg',
                          item.growth.startsWith('+') ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'
                        )}
                      >
                        {item.growth}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={revenueBreakdownChart} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={4}>
                      {revenueBreakdownChart.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const rawValue = Array.isArray(value) ? value[0] : value;
                        const numericValue = Number(rawValue ?? 0);
                        const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
                        return `${Math.round(safeValue).toLocaleString('vi-VN')} vnd`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1 text-xs text-gray-600">
                <p>Doanh thu tổng: <span className="font-black text-gray-900">{Math.round(stats?.revenue?.overall?.totalAmount || 0).toLocaleString('vi-VN')}vnd</span></p>
                <p>Đơn hoàn tất: <span className="font-black text-gray-900">{(stats?.revenue?.overall?.completedOrders || 0).toLocaleString('vi-VN')}</span></p>
                <p>Khách hàng: <span className="font-black text-gray-900">{(stats?.users?.customers || 0).toLocaleString('vi-VN')}</span></p>
                <p>PT: <span className="font-black text-gray-900">{(stats?.users?.pts || 0).toLocaleString('vi-VN')}</span></p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
