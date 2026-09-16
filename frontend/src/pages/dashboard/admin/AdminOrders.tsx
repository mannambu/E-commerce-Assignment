import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChefHat, Loader2, Search, Truck, XCircle } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type OrderStatus = 'Pending' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';

type AdminOrder = {
  _id: string;
  userId?: string;
  status: OrderStatus;
  packageType?: 'ONE_DAY' | 'WEEKLY_7D';
  subtotal?: number;
  shippingFee?: number;
  grandTotal?: number;
  createdAt?: string;
  payment?: {
    method?: 'COD' | 'VNPay' | 'MoMo';
    status?: 'Pending' | 'Paid' | 'Failed';
  };
};

const statusOrder: OrderStatus[] = ['Pending', 'Cooking', 'Delivering', 'Completed', 'Cancelled'];

const statusLabel: Record<OrderStatus, string> = {
  Pending: 'Chờ xử lý',
  Cooking: 'Đang chế biến',
  Delivering: 'Đang giao',
  Completed: 'Hoàn tất',
  Cancelled: 'Đã hủy'
};

function nextStatus(current: OrderStatus): 'Cooking' | 'Delivering' | 'Completed' | null {
  if (current === 'Pending') return 'Cooking';
  if (current === 'Cooking') return 'Delivering';
  if (current === 'Delivering') return 'Completed';
  return null;
}

export default function AdminOrders() {
  const [isLoading, setIsLoading] = useState(true);
  const [isActingOrderId, setIsActingOrderId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      setWarning(null);
      const res = await api.get('/orders/all');
      const data = Array.isArray(res.data?.result) ? res.data.result : [];
      setOrders(data);
    } catch (error: any) {
      console.error('Lỗi tải danh sách đơn hàng:', error);
      setWarning(error?.response?.data?.message || 'Không thể tải danh sách đơn hàng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return orders;

    return orders.filter((order) => {
      const idMatch = order._id.toLowerCase().includes(query);
      const userMatch = (order.userId || '').toLowerCase().includes(query);
      const paymentMethodMatch = (order.payment?.method || '').toLowerCase().includes(query);
      return idMatch || userMatch || paymentMethodMatch;
    });
  }, [orders, searchQuery]);

  const groupedOrders = useMemo(() => {
    const map: Record<OrderStatus, AdminOrder[]> = {
      Pending: [],
      Cooking: [],
      Delivering: [],
      Completed: [],
      Cancelled: []
    };

    for (const order of filteredOrders) {
      map[order.status].push(order);
    }

    for (const key of statusOrder) {
      map[key].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }

    return map;
  }, [filteredOrders]);

  const handleMoveNext = async (order: AdminOrder) => {
    const next = nextStatus(order.status);
    if (!next) return;

    try {
      setIsActingOrderId(order._id);
      setWarning(null);
      await api.patch(`/orders/${order._id}/status`, { status: next });
      setOrders((prev) => prev.map((item) => (item._id === order._id ? { ...item, status: next } : item)));
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể cập nhật trạng thái đơn hàng.');
    } finally {
      setIsActingOrderId(null);
    }
  };

  const handleCancel = async (order: AdminOrder) => {
    if (order.status === 'Cancelled' || order.status === 'Completed') return;

    try {
      setIsActingOrderId(order._id);
      setWarning(null);
      await api.patch(`/orders/${order._id}/cancel`);
      setOrders((prev) => prev.map((item) => (item._id === order._id ? { ...item, status: 'Cancelled' } : item)));
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể hủy đơn hàng này.');
    } finally {
      setIsActingOrderId(null);
    }
  };

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
        <Header title="Quản lý đơn hàng" userRole="Quản trị viên" hideSearch={true} />

        <main className="p-8 space-y-6 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="relative group w-full md:w-[28rem]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-orange-600 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Tìm theo mã đơn, userId, phương thức thanh toán..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 h-12 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-orange-600/10 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {statusOrder.map((status) => (
              <section key={status} className="bg-white rounded-[24px] border border-gray-100 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider">{statusLabel[status]}</h2>
                  <span className="px-2 py-1 rounded-lg bg-gray-100 text-[10px] font-black text-gray-600">
                    {groupedOrders[status].length}
                  </span>
                </div>

                <div className="space-y-3">
                  {groupedOrders[status].length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500 text-center">
                      Chưa có đơn hàng.
                    </div>
                  ) : (
                    groupedOrders[status].map((order) => {
                      const next = nextStatus(order.status);
                      const isActing = isActingOrderId === order._id;

                      return (
                        <article key={order._id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-gray-900">Order #{order._id.slice(-6).toUpperCase()}</p>
                              <p className="text-[11px] text-gray-500">User: {order.userId || 'N/A'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-gray-900">{Math.round(order.grandTotal || 0).toLocaleString('vi-VN')} đ</p>
                              <p className="text-[10px] text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : 'N/A'}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                            <p>Gói: <span className="font-bold text-gray-800">{order.packageType || 'ONE_DAY'}</span></p>
                            <p>Thanh tóan: <span className="font-bold text-gray-800">{order.payment?.method || 'N/A'}</span></p>
                            <p>Payment status: <span className="font-bold text-gray-800">{order.payment?.status || 'Pending'}</span></p>
                            <p>Shipping: <span className="font-bold text-gray-800">{Math.round(order.shippingFee || 0).toLocaleString('vi-VN')} đ</span></p>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {next ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleMoveNext(order)}
                                className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-blue-600 text-white text-xs font-black disabled:opacity-50"
                              >
                                {next === 'Cooking' ? <ChefHat size={14} /> : next === 'Delivering' ? <Truck size={14} /> : <CheckCircle2 size={14} />}
                                Chuyển sang {statusLabel[next]}
                              </button>
                            ) : null}

                            {(order.status !== 'Completed' && order.status !== 'Cancelled') ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleCancel(order)}
                                className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 text-xs font-black disabled:opacity-50"
                              >
                                <XCircle size={14} /> Hủy đơn hàng
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
