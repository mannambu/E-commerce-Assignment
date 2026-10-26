import { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  CheckCircle2,
  XCircle,
  UserCheck,
  Scale,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';
import CancellationRequestsModal from '@/components/workspace/CancellationRequestsModal';
import CodReconciliationModal from '@/components/workspace/CodReconciliationModal';

export default function ManagerWorkspace() {
  const [orders, setOrders] = useState<any[]>([]);
  const [staffs, setStaffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCodModal, setShowCodModal] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<any | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchWorkspaceOrders = async () => {
    try {
      setLoading(true);
      const [ordRes, staffRes] = await Promise.allSettled([
        api.get('/workspace/orders'),
        api.get('/workspace/staff')
      ]);

      if (ordRes.status === 'fulfilled') setOrders(ordRes.value.data?.result || []);
      if (staffRes.status === 'fulfilled') setStaffs(staffRes.value.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải dữ liệu vận hành:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceOrders();
  }, []);

  const handleOrderDecision = async (orderId: string, status: 'Confirmed' | 'Rejected', version: number) => {
    try {
      setIsSubmitting(true);
      await api.patch(`/orders/${orderId}/decision`, {
        status,
        version: version || 0,
        reason: status === 'Rejected' ? 'Bếp quá tải hoặc không đáp ứng' : undefined
      });
      fetchWorkspaceOrders();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Thao tác quyết định đơn thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignStaff = async () => {
    if (!assigningOrder || !selectedStaffId) return;
    const isShipper = assigningOrder.status === 'Ready';
    const endpoint = isShipper
      ? `/orders/${assigningOrder.orderId}/deliveries/${assigningOrder.deliveryId || assigningOrder._id}/shipper-assignment`
      : `/orders/${assigningOrder.orderId}/deliveries/${assigningOrder.deliveryId || assigningOrder._id}/kitchen-assignment`;

    const payload: any = {
      version: assigningOrder.version || 0,
      reason: isShipper ? 'Phân công Shipper giao hàng' : 'Phân công nhân viên Bếp'
    };

    if (isShipper) payload.assignedShipperId = selectedStaffId;
    else payload.kitchenStaffIds = [selectedStaffId];

    try {
      setIsSubmitting(true);
      await api.patch(endpoint, payload);
      setAssigningOrder(null);
      setSelectedStaffId('');
      fetchWorkspaceOrders();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Phân công thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus;
    const matchesSearch =
      searchTerm === '' ||
      o.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.deliveryAddress?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    // h-screen overflow-hidden giữ cho khung cố định chiều cao màn hình
    <div className="flex h-screen bg-[#faf8f5] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 1440 900" fill="none" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mgr-wave-purple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#7e22ce" />
            </linearGradient>
          </defs>
          <path d="M800,-100 C1100,50 1550,150 1550,400 C1300,450 950,250 800,-100 Z" fill="url(#mgr-wave-purple)" className="opacity-15 blur-3xl" />
        </svg>
      </div>

      {/* Sidebar luôn đứng yên bên trái */}
      <Sidebar role="manager" />

      {/* Khung nội dung bên phải tự cuộn độc lập */}
      <div className="flex-1 flex flex-col min-w-0 z-10 h-screen overflow-hidden">
        <Header title="Điều phối vận hành (WF-24A)" userRole="Quản lý Vận hành" hideSearch={true} />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto min-w-0">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setShowCancelModal(true)} variant="outline" className="rounded-2xl text-xs bg-white/80">
              <AlertTriangle size={14} className="mr-1.5 text-amber-600" /> Yêu cầu hủy COD
            </Button>
            <Button onClick={() => setShowCodModal(true)} variant="outline" className="rounded-2xl text-xs bg-white/80">
              <Scale size={14} className="mr-1.5 text-purple-600" /> Sự cố & Đối soát COD
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/80 shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {/* Bổ sung Cancelled và Rejected vào danh sách nút lọc */}
              {['all', 'Pending', 'Confirmed', 'Cooking', 'Ready', 'Delivering', 'Completed', 'Cancelled', 'Rejected'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
                    filterStatus === st
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Tìm mã đơn hoặc địa chỉ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs focus:outline-none w-full sm:w-64"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 className="animate-spin mx-auto text-purple-600 mb-2" size={36} />
              <p className="text-sm font-semibold">Đang tải đơn vận hành...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-20 text-center bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-xs space-y-3">
              <ClipboardList className="mx-auto text-gray-300" size={48} />
              <h3 className="text-lg font-bold text-gray-800">Không có đơn hàng nào</h3>
              <p className="text-xs text-gray-400">Không tìm thấy đơn hàng phù hợp với bộ lọc hiện tại.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
              {filteredOrders.map((order) => {
                const deliveryId = order.deliveryId || order._id;
                const isCancelledOrRejected = order.status === 'Cancelled' || order.status === 'Rejected';
                
                return (
                  <div
                    key={deliveryId}
                    className="bg-white/90 backdrop-blur-md rounded-[28px] border border-white/80 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-purple-600">#{order.orderId?.slice(-8) || deliveryId?.slice(-8)}</span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            isCancelledOrRejected
                              ? 'bg-red-50 text-red-600'
                              : order.status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : order.status === 'Pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-purple-500 uppercase tracking-wider">Địa chỉ giao:</p>
                        <p className="text-sm text-gray-800 font-bold line-clamp-2">{order.deliveryAddress}</p>
                      </div>

                      {order.codExpectedAmount > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs font-bold text-amber-900 flex justify-between items-center">
                          <span>Thu hộ COD:</span>
                          <span className="font-mono text-sm">{order.codExpectedAmount.toLocaleString('vi-VN')} đ</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                      {order.status === 'Pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderDecision(order.orderId, 'Rejected', order.version)}
                            className="flex-1 rounded-xl text-xs text-red-600 border-red-200"
                          >
                            <XCircle size={14} className="mr-1" /> Từ chối
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleOrderDecision(order.orderId, 'Confirmed', order.version)}
                            className="flex-1 rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            <CheckCircle2 size={14} className="mr-1" /> Xác nhận
                          </Button>
                        </div>
                      )}

                      {(order.status === 'Confirmed' || order.status === 'Ready') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAssigningOrder(order)}
                          className="w-full rounded-xl text-xs"
                        >
                          <UserCheck size={14} className="mr-1.5" />
                          {order.status === 'Confirmed' ? 'Gán nhân viên Bếp' : 'Gán Shipper giao hàng'}
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

      <CancellationRequestsModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onSuccess={fetchWorkspaceOrders}
      />

      <CodReconciliationModal
        isOpen={showCodModal}
        onClose={() => setShowCodModal(false)}
        onSuccess={fetchWorkspaceOrders}
      />

      {assigningOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-gray-900">
              {assigningOrder.status === 'Confirmed' ? 'Phân công nhân viên Bếp' : 'Phân công Shipper giao hàng'}
            </h3>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700">Chọn nhân viên thực hiện:</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none"
              >
                <option value="">-- Chọn nhân viên --</option>
                {staffs
                  .filter((s) => {
                    const roleLower = (s.role || '').toLowerCase();
                    return assigningOrder.status === 'Confirmed'
                      ? (roleLower.includes('kitchen') || s.role === 'Kitchen Staff')
                      : (roleLower.includes('delivery') || roleLower.includes('shipper') || s.role === 'Delivery Staff');
                  })
                  .map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.username} ({s.email})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAssigningOrder(null)} className="rounded-xl text-xs">
                Hủy
              </Button>
              <Button
                disabled={!selectedStaffId || isSubmitting}
                onClick={handleAssignStaff}
                className="rounded-xl text-xs bg-purple-600 hover:bg-purple-700 text-white"
              >
                Xác nhận gán
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}