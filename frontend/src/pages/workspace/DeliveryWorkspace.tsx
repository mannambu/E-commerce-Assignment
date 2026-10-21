import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Truck,
  MapPin,
  Phone,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogOut,
  DollarSign,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

export default function DeliveryWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeliveryRuns = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/orders');
      setRuns(res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách chuyến giao:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryRuns();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Khu vực Giao hàng (WF-24C)</h1>
            <p className="text-xs text-slate-500">Lịch trình các đơn giao và thu hộ COD</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">{user?.username || 'Nhân viên giao'}</p>
            <p className="text-xs font-semibold text-blue-600 uppercase">Delivery Staff</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDeliveryRuns} className="min-h-[40px]">
            <RefreshCw size={16} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-600 hover:bg-red-50 min-h-[40px]">
            <LogOut size={16} className="mr-1" /> Đăng xuất
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="animate-spin mx-auto text-blue-600 mb-2" size={32} />
            <p className="text-sm">Đang tải danh sách đơn giao...</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <Truck className="mx-auto text-slate-300" size={48} />
            <h3 className="text-lg font-bold text-slate-800">Không có đơn giao nào</h3>
            <p className="text-xs text-slate-400">Hiện tại bạn chưa được phân công đơn giao hàng mới.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {runs.map((run) => (
              <div
                key={run.deliveryId || run._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-500">#{run.deliveryId?.slice(-6) || run._id?.slice(-6)}</span>
                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
                      {run.status || 'Delivering'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase">Địa chỉ khách nhận:</p>
                    <p className="text-sm text-slate-800 font-medium flex items-start gap-1.5">
                      <MapPin size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <span>{run.deliveryAddress || 'Chưa cung cấp địa chỉ'}</span>
                    </p>
                  </div>

                  {run.codExpectedAmount > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-xl flex items-center justify-between text-xs font-bold text-amber-900">
                      <span className="flex items-center gap-1">
                        <DollarSign size={16} /> Thu tiền COD:
                      </span>
                      <span className="text-base font-black text-amber-700 font-mono">
                        {run.codExpectedAmount.toLocaleString('vi-VN')} đ
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Ngày: {run.deliveryDate || 'Hôm nay'}</span>
                  <span>Bữa: {run.mealSlot || 'Trưa'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
