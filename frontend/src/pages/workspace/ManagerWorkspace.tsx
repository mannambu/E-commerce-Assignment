import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ClipboardList,
  Utensils,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

export default function ManagerWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchWorkspaceOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/orders');
      setOrders(res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách đơn vận hành:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceOrders();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <ClipboardList size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Điều phối vận hành (WF-24A)</h1>
            <p className="text-xs text-slate-500">Quản lý & Giám sát tiến độ đơn hàng theo thời gian thực</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">{user?.username || 'Quản lý'}</p>
            <p className="text-xs font-semibold text-teal-600 uppercase">Manager</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchWorkspaceOrders} className="min-h-[40px]">
            <RefreshCw size={16} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-600 hover:bg-red-50 min-h-[40px]">
            <LogOut size={16} className="mr-1" /> Đăng xuất
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
            {['all', 'Pending', 'Confirmed', 'Cooking', 'Ready', 'Delivering', 'Completed'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  filterStatus === st
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'Tất cả' : st}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Tìm theo mã đơn hoặc địa chỉ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Order Cards / List */}
        {loading ? (
          <div className="py-20 text-center text-slate-400">
            <RefreshCw className="animate-spin mx-auto text-teal-600 mb-2" size={32} />
            <p className="text-sm">Đang tải danh sách đơn vận hành...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <ClipboardList className="mx-auto text-slate-300" size={48} />
            <h3 className="text-lg font-bold text-slate-800">Không có đơn hàng nào</h3>
            <p className="text-xs text-slate-400">Không tìm thấy đơn hàng phù hợp với bộ lọc hiện tại.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map((order) => (
              <div
                key={order.orderId || order._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-slate-500">#{order.orderId?.slice(-8) || order._id?.slice(-8)}</span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                        order.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700'
                          : order.status === 'Delivering'
                          ? 'bg-blue-50 text-blue-700'
                          : order.status === 'Cooking'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase">Địa chỉ giao:</p>
                    <p className="text-sm text-slate-700 font-medium line-clamp-2">{order.deliveryAddress || 'Nhận tại cửa hàng'}</p>
                  </div>

                  {order.codExpectedAmount > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200/60 rounded-xl text-xs font-bold text-amber-800 flex justify-between items-center">
                      <span>Thu hộ COD:</span>
                      <span className="font-mono text-sm">{order.codExpectedAmount.toLocaleString('vi-VN')} đ</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>Ngày: {order.deliveryDate || 'Hôm nay'}</span>
                  <span>Bữa: {order.mealSlot || 'Trưa'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
