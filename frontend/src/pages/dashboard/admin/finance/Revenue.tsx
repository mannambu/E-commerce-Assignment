import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { ShoppingBag, Users, Truck, Loader2 } from 'lucide-react';
import api from '@/services/api';

type DashboardStats = {
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

type AdminOrder = {
  status?: 'Pending' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';
  shippingFee?: number;
};

export default function FinanceRevenue() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        setIsLoading(true);
        setWarning(null);

        const [statsRes, ordersRes] = await Promise.all([api.get('/admin/dashboard-stats'), api.get('/orders/all')]);

        setStats(statsRes.data?.result || {});
        setOrders(Array.isArray(ordersRes.data?.result) ? ordersRes.data.result : []);
      } catch (error: any) {
        console.error('Loi tai finance revenue:', error);
        setWarning(error?.response?.data?.message || 'Khong the tai du lieu doanh thu.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRevenue();
  }, []);

  const completedOrders = useMemo(() => orders.filter((order) => order.status === 'Completed'), [orders]);

  const deliveryRevenue = useMemo(
    () => completedOrders.reduce((sum, order) => sum + Number(order.shippingFee || 0), 0),
    [completedOrders]
  );

  const foodRevenue = Number(stats?.revenue?.breakdown?.FOOD_ONE_DAY?.revenue || 0);
  const comboRevenue = Number(stats?.revenue?.breakdown?.COMBO_WEEKLY?.revenue || 0);
  const otherRevenue = Number(stats?.revenue?.breakdown?.OTHER?.revenue || 0);
  const totalRevenue = Number(stats?.revenue?.overall?.totalAmount || 0);
  const thisMonthRevenue = Number(stats?.revenue?.thisMonth?.totalAmount || 0);

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

  const revenueSources = [
    {
      name: 'Do an (Food one day)',
      amount: foodRevenue,
      icon: <ShoppingBag size={22} />,
      color: 'bg-orange-500',
      ratio: totalRevenue > 0 ? (foodRevenue / totalRevenue) * 100 : 0
    },
    {
      name: 'Phi giao hang',
      amount: deliveryRevenue,
      icon: <Truck size={22} />,
      color: 'bg-blue-500',
      ratio: totalRevenue > 0 ? (deliveryRevenue / totalRevenue) * 100 : 0
    },
    {
      name: 'Combo weekly + Other',
      amount: comboRevenue + otherRevenue,
      icon: <Users size={22} />,
      color: 'bg-green-500',
      ratio: totalRevenue > 0 ? ((comboRevenue + otherRevenue) / totalRevenue) * 100 : 0
    }
  ];

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Theo doi Doanh thu" userRole="Quan tri vien" hideSearch={true} />
        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {revenueSources.map((source) => (
              <div key={source.name} className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-4">
                <div className={`w-12 h-12 ${source.color} text-white rounded-2xl flex items-center justify-center shadow-lg`}>
                  {source.icon}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{source.name}</p>
                  <h3 className="text-2xl font-black text-gray-900 mt-1">{Math.round(source.amount).toLocaleString('vi-VN')} d</h3>
                  <p className="text-xs font-semibold text-gray-500 mt-2">Ti trong: {Math.round(source.ratio)}%</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <h2 className="text-xl font-black text-gray-900">Tong quan doanh thu</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tong doanh thu</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(totalRevenue).toLocaleString('vi-VN')} d</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Doanh thu thang nay</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(thisMonthRevenue).toLocaleString('vi-VN')} d</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Don hoan tat</p>
                <p className="text-2xl font-black text-gray-900 mt-2">{(stats?.revenue?.overall?.completedOrders || 0).toLocaleString('vi-VN')}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-600 leading-7">
              <p>Food one day: <span className="font-black text-gray-900">{Math.round(foodRevenue).toLocaleString('vi-VN')} d</span></p>
              <p>Combo weekly: <span className="font-black text-gray-900">{Math.round(comboRevenue).toLocaleString('vi-VN')} d</span></p>
              <p>Delivery fee (tu don hoan tat): <span className="font-black text-gray-900">{Math.round(deliveryRevenue).toLocaleString('vi-VN')} d</span></p>
              <p>Other package: <span className="font-black text-gray-900">{Math.round(otherRevenue).toLocaleString('vi-VN')} d</span></p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
