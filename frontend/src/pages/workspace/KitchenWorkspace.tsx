import { useState, useEffect } from 'react';
import { Utensils, RefreshCw, Loader2, CheckCircle2, Flame } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

export default function KitchenWorkspace() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const fetchKitchenOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/orders');
      setOrders(res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách bếp:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
  }, []);

  const handleUpdateStatus = async (orderId: string, deliveryId: string, currentStatus: string, version: number) => {
    let nextStatus = '';
    if (currentStatus === 'Confirmed') nextStatus = 'Cooking';
    else if (currentStatus === 'Cooking') nextStatus = 'Ready';

    if (!nextStatus) return;

    try {
      setUpdatingId(deliveryId || orderId);
      await api.patch(`/orders/${orderId}/deliveries/${deliveryId}/kitchen-status`, {
        status: nextStatus,
        version: version || 0
      });
      await fetchKitchenOrders();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Không thể cập nhật trạng thái chế biến');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => filterStatus === 'all' || o.status === filterStatus);

  return (
    <div className="flex h-screen bg-[#faf8f5] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="kitchen-wave-red" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
            <linearGradient id="kitchen-wave-rose" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#be123c" />
            </linearGradient>
          </defs>
          <path d="M-100,-50 C300,100 450,280 150,450 C-100,550 -200,300 -100,-50 Z" fill="url(#kitchen-wave-red)" className="opacity-15 blur-3xl" />
          <path d="M800,-100 C1100,50 1550,150 1550,400 C1300,450 950,250 800,-100 Z" fill="url(#kitchen-wave-rose)" className="opacity-10 blur-3xl" />
        </svg>
      </div>

      <Sidebar role="kitchen" />

      <div className="flex-1 flex flex-col min-w-0 z-10 h-screen overflow-hidden">
        <Header title="Khu vực chế biến Bếp (WF-24B)" userRole="Nhân viên Bếp" hideSearch={true} />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto min-w-0">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/80 shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {['all', 'Confirmed', 'Cooking', 'Ready'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                    filterStatus === st
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st === 'Confirmed' ? 'Đã xác nhận (Chờ nấu)' : st === 'Cooking' ? 'Đang nấu' : 'Sẵn sàng'}
                </button>
              ))}
            </div>

            <Button onClick={fetchKitchenOrders} variant="outline" className="rounded-2xl h-10 text-xs">
              <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </Button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 className="animate-spin mx-auto text-red-600 mb-2" size={36} />
              <p className="text-sm font-semibold">Đang tải suất ăn cần chế biến...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-xs space-y-3">
              <Utensils className="mx-auto text-gray-300" size={48} />
              <h3 className="text-lg font-bold text-gray-800">Không có suất ăn nào</h3>
              <p className="text-xs text-gray-400">Không có đơn hàng nào được phân công hoặc phù hợp bộ lọc.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {filteredOrders.map((order) => {
                const deliveryId = order.deliveryId || order._id;
                const isProcessing = updatingId === deliveryId;

                return (
                  <div
                    key={deliveryId}
                    className="bg-white/90 backdrop-blur-md rounded-[28px] border border-white/80 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-red-600">#{order.orderId?.slice(-8) || deliveryId?.slice(-8)}</span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            order.status === 'Ready'
                              ? 'bg-emerald-50 text-emerald-700'
                              : order.status === 'Cooking'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {order.status === 'Confirmed' ? 'Chờ nấu' : order.status === 'Cooking' ? 'Đang nấu' : 'Sẵn sàng'}
                        </span>
                      </div>

                      <div className="space-y-2 border-t border-b border-gray-100/80 py-3">
                        <p className="text-xs font-extrabold text-red-500 uppercase tracking-wider">Danh sách món ăn:</p>
                        {Array.isArray(order.items) && order.items.length > 0 ? (
                          order.items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs font-bold text-gray-800">
                              <span>{it.foodName || it.name}</span>
                              <span className="text-red-600 font-black">x{it.quantity}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500 font-semibold">{order.foodName || 'Suất ăn tiêu chuẩn'}</p>
                        )}
                      </div>

                      <div className="flex justify-between text-xs text-gray-400 font-semibold">
                        <span>Ngày giao: {order.deliveryDate || 'Hôm nay'}</span>
                        <span>Bữa: {order.mealSlot || 'Trưa'}</span>
                      </div>
                    </div>

                    <div className="pt-2">
                      {order.status === 'Confirmed' && (
                        <Button
                          onClick={() => handleUpdateStatus(order.orderId, deliveryId, 'Confirmed', order.version)}
                          disabled={isProcessing}
                          className="w-full rounded-2xl h-11 bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                        >
                          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <><Flame size={16} className="mr-1.5" /> Bắt đầu nấu (Cooking)</>}
                        </Button>
                      )}

                      {order.status === 'Cooking' && (
                        <Button
                          onClick={() => handleUpdateStatus(order.orderId, deliveryId, 'Cooking', order.version)}
                          disabled={isProcessing}
                          className="w-full rounded-2xl h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} className="mr-1.5" /> Món sẵn sàng (Ready)</>}
                        </Button>
                      )}

                      {order.status === 'Ready' && (
                        <div className="p-2.5 bg-emerald-50 rounded-2xl text-center text-xs font-bold text-emerald-700">
                          Đã hoàn thành chế biến
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}