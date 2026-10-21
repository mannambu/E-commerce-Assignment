import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Utensils,
  CheckCircle2,
  Clock,
  RefreshCw,
  LogOut,
  Flame,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

export default function KitchenWorkspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKitchenTasks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/orders');
      setTasks(res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải danh sách bếp:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenTasks();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Utensils size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Khu vực chế biến Bếp (WF-24B)</h1>
            <p className="text-xs text-slate-500">Danh sách suất ăn cần chuẩn bị và nấu</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">{user?.username || 'Đầu bếp'}</p>
            <p className="text-xs font-semibold text-orange-600 uppercase">Kitchen Staff</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchKitchenTasks} className="min-h-[40px]">
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
            <RefreshCw className="animate-spin mx-auto text-orange-600 mb-2" size={32} />
            <p className="text-sm">Đang tải danh sách món cần nấu...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <Flame className="mx-auto text-slate-300" size={48} />
            <h3 className="text-lg font-bold text-slate-800">Không có suất ăn nào cần chuẩn bị</h3>
            <p className="text-xs text-slate-400">Tất cả các món đã được hoàn tất hoặc chưa có lượt phân công mới.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task) => (
              <div
                key={task.deliveryId || task._id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-500">Mã kỳ: #{task.deliveryId?.slice(-6) || task._id?.slice(-6)}</span>
                  <span className="px-2.5 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded-full">
                    {task.status || 'Cooking'}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 font-bold uppercase">Ngày giao & Bữa:</p>
                  <p className="text-base font-bold text-slate-900">{task.deliveryDate || 'Hôm nay'} — {task.mealSlot || 'Trưa'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
