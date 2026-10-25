import { useState, useEffect } from 'react';
import { Truck, RefreshCw, Loader2 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/services/api';

export default function DeliveryWorkspace() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const [codInput, setCodInput] = useState('');
  const [failReason, setFailReason] = useState('Khách vắng nhà');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDeliveryOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/orders');
      setOrders(res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách giao hàng:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryOrders();
  }, []);

  const handleStartDelivering = async (order: any) => {
    try {
      setIsSubmitting(true);
      await api.patch(`/orders/${order.orderId}/deliveries/${order.deliveryId || order._id}/shipper-status`, {
        status: 'Delivering',
        version: order.version || 0
      });
      fetchDeliveryOrders();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Không thể cập nhật xuất phát giao hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteDelivery = async (status: 'Completed' | 'Failed') => {
    if (!selectedOrder) return;
    const deliveryId = selectedOrder.deliveryId || selectedOrder._id;

    let evidenceUrls: string[] = [];
    if (status === 'Failed' && evidenceFile) {
      try {
        const formData = new FormData();
        formData.append('image', evidenceFile);
        const uploadRes = await api.post('/medias/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        evidenceUrls = uploadRes.data?.result || [];
      } catch (err) {
        alert('Tải ảnh bằng chứng thất bại, vẫn tiếp tục gửi lý do.');
      }
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        status,
        version: selectedOrder.version || 0
      };

      if (status === 'Completed') {
        if (selectedOrder.codExpectedAmount > 0) {
          payload.codCollectedAmount = Number(codInput) || selectedOrder.codExpectedAmount;
        }
      } else {
        payload.reason = failReason;
        payload.evidenceUrls = evidenceUrls;
      }

      await api.patch(`/orders/${selectedOrder.orderId}/deliveries/${deliveryId}/shipper-status`, payload);
      setSelectedOrder(null);
      setCodInput('');
      setEvidenceFile(null);
      fetchDeliveryOrders();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Cập nhật kết quả giao hàng thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = orders.filter((o) => filterStatus === 'all' || o.status === filterStatus);

  return (
    <div className="flex h-screen bg-[#faf8f5] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="del-wave-blue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <path d="M-150,550 C200,450 450,700 250,950 C0,1050 -150,850 -150,550 Z" fill="url(#del-wave-blue)" className="opacity-15 blur-3xl" />
        </svg>
      </div>

      <Sidebar role="delivery" />

      <div className="flex-1 flex flex-col min-w-0 z-10 h-screen overflow-hidden">
        <Header title="Khu vực Giao hàng (WF-24C)" userRole="Nhân viên Giao hàng" hideSearch={true} />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto min-w-0">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/80 shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {['all', 'Ready', 'Delivering', 'Completed', 'Failed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                    filterStatus === st
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st}
                </button>
              ))}
            </div>

            <Button onClick={fetchDeliveryOrders} variant="outline" className="rounded-2xl h-10 text-xs">
              <RefreshCw size={14} className={`mr-2 ${loading ? 'animate-spin' : ''}`} /> Làm mới
            </Button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 className="animate-spin mx-auto text-blue-600 mb-2" size={36} />
              <p className="text-sm font-semibold">Đang tải công việc giao hàng...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-xs space-y-3">
              <Truck className="mx-auto text-gray-300" size={48} />
              <h3 className="text-lg font-bold text-gray-800">Không có công việc phù hợp</h3>
              <p className="text-xs text-gray-400">Kiểm tra bộ lọc hoặc chờ quản lý phân công đơn hàng.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {filteredOrders.map((order) => {
                const deliveryId = order.deliveryId || order._id;
                return (
                  <div
                    key={deliveryId}
                    className="bg-white/90 backdrop-blur-md rounded-[28px] border border-white/80 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-blue-600">#{order.orderId?.slice(-8) || deliveryId?.slice(-8)}</span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                          {order.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-blue-500 uppercase tracking-wider">Địa chỉ giao hàng:</p>
                        <p className="text-sm text-gray-800 font-bold">{order.deliveryAddress}</p>
                      </div>

                      {order.codExpectedAmount > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs font-bold text-amber-900 flex justify-between items-center">
                          <span>Số tiền COD thu hộ:</span>
                          <span className="font-mono text-sm">{order.codExpectedAmount.toLocaleString('vi-VN')} đ</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2">
                      {order.status === 'Ready' && (
                        <Button
                          onClick={() => handleStartDelivering(order)}
                          disabled={isSubmitting}
                          className="w-full rounded-2xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                        >
                          <Truck size={16} className="mr-2" /> Nhận đơn & Xuất phát
                        </Button>
                      )}

                      {order.status === 'Delivering' && (
                        <Button
                          onClick={() => {
                            setSelectedOrder(order);
                            setCodInput(String(order.codExpectedAmount || ''));
                          }}
                          className="w-full rounded-2xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                        >
                          Cập nhật kết quả giao
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <h3 className="text-lg font-black text-gray-900">Cập nhật đơn #{selectedOrder.orderId?.slice(-8)}</h3>

            {selectedOrder.codExpectedAmount > 0 && (
              <Input
                label="Số tiền COD thực tế thu được (VNĐ)"
                type="number"
                value={codInput}
                onChange={(e) => setCodInput(e.target.value)}
              />
            )}

            <div className="space-y-2 border-t border-gray-100 pt-3">
              <label className="text-xs font-bold text-gray-700">Nếu giao thất bại, chọn lý do:</label>
              <select
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none"
              >
                <option value="Khách vắng nhà">Khách vắng nhà</option>
                <option value="Sai địa chỉ / Không liên lạc được">Sai địa chỉ / Không liên lạc được</option>
                <option value="Khách từ chối nhận món">Khách từ chối nhận món</option>
                <option value="Món ăn bị hỏng hóc sự cố">Món ăn bị hỏng hóc sự cố</option>
              </select>

              <div className="pt-2">
                <label className="text-xs font-bold text-gray-700 block mb-1">Ảnh minh chứng thất bại (tùy chọn):</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                  className="text-xs text-gray-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <Button variant="outline" onClick={() => setSelectedOrder(null)} className="rounded-xl text-xs">
                Hủy bỏ
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => handleCompleteDelivery('Failed')}
                className="rounded-xl text-xs bg-red-600 hover:bg-red-700 text-white"
              >
                Giao thất bại
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => handleCompleteDelivery('Completed')}
                className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Giao thành công
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}