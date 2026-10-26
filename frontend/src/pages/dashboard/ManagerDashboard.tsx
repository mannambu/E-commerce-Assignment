import { useState, useEffect } from 'react';
import { 
  TrendingUp, ShoppingBag, Utensils, Users, 
  DollarSign, ArrowUpRight, Clock, CheckCircle2, AlertCircle 
} from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import api from '@/services/api';

interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalFoods: number;
  totalCustomers: number;
  revenueChange: number;
  recentOrders: Array<{
    _id: string;
    customerName: string;
    totalAmount: number;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
    createdAt: string;
  }>;
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/analytics/dashboard').catch(() => null);

      if (res?.data?.result) {
        setStats(res.data.result);
      } else {
        setStats({
          totalRevenue: 45280000,
          totalOrders: 324,
          totalFoods: 48,
          totalCustomers: 1120,
          revenueChange: 12.5,
          recentOrders: [
            { _id: 'ORD001', customerName: 'Nguyễn Văn A', totalAmount: 350000, status: 'PROCESSING', createdAt: '2026-10-21T10:30:00Z' },
            { _id: 'ORD002', customerName: 'Trần Thị B', totalAmount: 1200000, status: 'COMPLETED', createdAt: '2026-10-21T09:15:00Z' },
            { _id: 'ORD003', customerName: 'Lê Hoàng C', totalAmount: 180000, status: 'PENDING', createdAt: '2026-10-21T08:45:00Z' },
          ]
        });
      }
    } catch (err) {
      console.error('Lỗi lấy dữ liệu Manager Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 1. Thanh Sidebar cố định bên trái (Khớp role Manager / Admin) */}
      <Sidebar role="admin" />

      {/* 2. Nội dung chính Manager Dashboard */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        {loading ? (
          <div className="flex h-96 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* HEADER DASHBOARD */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900">Quản trị Hệ thống (Manager)</h1>
                <p className="text-sm font-medium text-gray-500">
                  Theo dõi chỉ số kinh doanh và điều hành hoạt động FitBite hôm nay.
                </p>
              </div>
              <button 
                onClick={fetchDashboardData}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all"
              >
                <TrendingUp size={18} />
                Cập nhật số liệu
              </button>
            </div>

            {/* THỐNG KÊ KPI CARDS */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Tổng doanh thu</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <DollarSign size={20} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{formatCurrency(stats?.totalRevenue || 0)}</h3>
                  <span className="flex items-center text-xs font-bold text-emerald-600">
                    <ArrowUpRight size={14} />
                    +{stats?.revenueChange}%
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Đơn hàng</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <ShoppingBag size={20} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{stats?.totalOrders}</h3>
                  <span className="text-xs font-medium text-gray-400">tháng này</span>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Thực đơn active</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
                    <Utensils size={20} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{stats?.totalFoods}</h3>
                  <span className="text-xs font-medium text-gray-400">món & combo</span>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Khách hàng</span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                    <Users size={20} />
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <h3 className="text-2xl font-black text-gray-900">{stats?.totalCustomers}</h3>
                  <span className="text-xs font-medium text-gray-400">tài khoản</span>
                </div>
              </div>
            </div>

            {/* BẢNG ĐƠN HÀNG XỬ LÝ GẦN ĐÂY */}
            <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Đơn hàng cần xử lý gần đây</h2>
                  <p className="text-xs text-gray-400">Danh sách các đơn đặt hàng mới phát sinh trong ngày</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase text-gray-400">
                      <th className="pb-3 font-bold">Mã đơn</th>
                      <th className="pb-3 font-bold">Khách hàng</th>
                      <th className="pb-3 font-bold">Tổng tiền</th>
                      <th className="pb-3 font-bold">Trạng thái</th>
                      <th className="pb-3 font-bold">Thời gian</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats?.recentOrders?.map((order) => (
                      <tr key={order._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 font-bold text-gray-900">#{order._id}</td>
                        <td className="py-4 font-medium text-gray-700">{order.customerName}</td>
                        <td className="py-4 font-bold text-gray-900">{formatCurrency(order.totalAmount)}</td>
                        <td className="py-4">
                          {order.status === 'COMPLETED' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-600">
                              <CheckCircle2 size={14} /> Hoàn thành
                            </span>
                          )}
                          {order.status === 'PROCESSING' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                              <Clock size={14} /> Đang giao
                            </span>
                          )}
                          {order.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">
                              <AlertCircle size={14} /> Chờ duyệt
                            </span>
                          )}
                        </td>
                        <td className="py-4 text-xs font-medium text-gray-400">
                          {new Date(order.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}