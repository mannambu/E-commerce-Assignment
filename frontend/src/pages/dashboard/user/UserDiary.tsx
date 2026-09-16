import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Flame, Loader2, Plus } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type CalorieEntry = {
  sourceType: 'Order' | 'Manual' | 'Legacy';
  caloriesConsumed: number;
  note?: string;
};

type DailyHistory = {
  date: string;
  caloriesConsumed: number;
  entries: CalorieEntry[];
};

export default function UserDiary() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [targetCalories, setTargetCalories] = useState(0);
  const [todayCalories, setTodayCalories] = useState(0);
  const [history, setHistory] = useState<DailyHistory[]>([]);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualCalories, setManualCalories] = useState('');
  const [note, setNote] = useState('');

  const fetchTrackingData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const [historyRes, todayRes] = await Promise.allSettled([
        api.get('/tracking/calories'),
        api.get('/tracking/calories/today')
      ]);

      if (historyRes.status === 'fulfilled') {
        const result = historyRes.value.data?.result;
        const rawHistory = Array.isArray(result?.history) ? result.history : [];
        const mapped: DailyHistory[] = rawHistory.map((item: any) => ({
          date: item.date,
          caloriesConsumed: Number(item.caloriesConsumed || 0),
          entries: Array.isArray(item.entries)
            ? item.entries.map((entry: any) => ({
                sourceType: entry.sourceType || 'Legacy',
                caloriesConsumed: Number(entry.caloriesConsumed || 0),
                note: entry.note
              }))
            : []
        }));

        setHistory(mapped);
        setTargetCalories(Number(result?.targetCalories || 0));
      }

      if (todayRes.status === 'fulfilled') {
        setTodayCalories(Number(todayRes.value.data?.result?.caloriesConsumed || 0));
        if (!targetCalories) {
          setTargetCalories(Number(todayRes.value.data?.result?.targetCalories || 0));
        }
      }

      if (historyRes.status === 'rejected' && todayRes.status === 'rejected') {
        setWarning('Không thể tải dữ liệu nhật ký thực phẩm.');
      }
    } catch (error) {
      console.error('Lỗi tải nhật ký thực phẩm:', error);
      setWarning('Có lỗi xảy ra khi tải nhật ký thực phẩm.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
  }, []);

  const remaining = Math.max(0, targetCalories - todayCalories);

  const totalLogs = useMemo(
    () => history.reduce((sum, day) => sum + day.entries.length, 0),
    [history]
  );

  const recentDays = useMemo(() => {
    return [...history]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 14);
  }, [history]);

  const handleAddManualCalories = async () => {
    const calories = Number(manualCalories);
    if (!date || !Number.isFinite(calories) || calories <= 0) {
      setWarning('Vui lòng nhập ngày và calories hợp lệ (> 0).');
      return;
    }

    try {
      setIsSubmitting(true);
      setWarning(null);

      await api.post('/tracking/calories', {
        date,
        caloriesConsumed: calories,
        note: note.trim()
      });

      setManualCalories('');
      setNote('');
      await fetchTrackingData();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể thêm log calories.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar role="user" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="user" />

      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Nhật ký thực phẩm" userRole="Người dùng" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card title="Calories hôm nay" value={`${todayCalories.toLocaleString('vi-VN')} kcal`} />
            <Card title="Mục tiêu mỗi ngày" value={`${targetCalories.toLocaleString('vi-VN')} kcal`} />
            <Card title="Calories còn lại" value={`${remaining.toLocaleString('vi-VN')} kcal`} />
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center gap-3">
              <Plus size={20} className="text-gray-900" />
              <h2 className="text-xl font-black text-gray-900">Thêm calories thủ công</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input
                label="Calories"
                type="number"
                placeholder="Ví dụ: 450"
                value={manualCalories}
                onChange={(e) => setManualCalories(e.target.value)}
              />
              <div className="md:col-span-2">
                <Input label="Ghi chú" placeholder="Ví dụ: Bữa tối ngoài hàng" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleAddManualCalories} disabled={isSubmitting} className="rounded-xl">
                {isSubmitting ? 'Đang lưu...' : 'Lưu log calories'}
              </Button>
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">Lịch sử calories theo ngày</h2>
              <p className="text-sm font-semibold text-gray-500">Tổng số log: {totalLogs}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-4">Ngày</th>
                    <th className="pb-4">Tổng calories</th>
                    <th className="pb-4">Số log</th>
                    <th className="pb-4">Nguồn dữ liệu</th>
                    <th className="pb-4">Ghi chú gần nhất</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentDays.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm font-medium text-gray-500">
                        Chưa có dữ liệu tracking calories.
                      </td>
                    </tr>
                  ) : (
                    recentDays.map((day) => {
                      const sourceLabels = Array.from(new Set(day.entries.map((entry) => entry.sourceType))).join(', ');
                      const latestNote = [...day.entries].reverse().find((entry) => entry.note?.trim())?.note || '-';

                      return (
                        <tr key={day.date} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-4 text-sm font-semibold text-gray-700">
                            <div className="flex items-center gap-2">
                              <CalendarDays size={15} className="text-gray-400" />
                              {new Date(day.date).toLocaleDateString('vi-VN')}
                            </div>
                          </td>
                          <td className="py-4 text-sm font-black text-gray-900">
                            <div className="flex items-center gap-2">
                              <Flame size={14} className="text-orange-500" />
                              {day.caloriesConsumed.toLocaleString('vi-VN')} kcal
                            </div>
                          </td>
                          <td className="py-4 text-sm text-gray-600">{day.entries.length}</td>
                          <td className="py-4 text-sm text-gray-600">{sourceLabels || '-'}</td>
                          <td className="py-4 text-sm text-gray-600 max-w-[320px] truncate">{latestNote}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <article className="bg-white p-5 rounded-[24px] shadow-sm border border-gray-50">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</p>
      <p className="text-2xl font-black text-gray-900 mt-2">{value}</p>
    </article>
  );
}
