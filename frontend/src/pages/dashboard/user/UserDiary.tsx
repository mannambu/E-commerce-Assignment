import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Flame,
  Loader2,
  Plus,
  Scale,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Minus
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import { getVietnamLocalDate } from '@/lib/date';

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

type WeightRecord = {
  date: string;
  weightKg: number;
  note?: string;
};

export default function UserDiary() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Calorie State
  const [targetCalories, setTargetCalories] = useState(2000);
  const [todayCalories, setTodayCalories] = useState(0);
  const [calorieHistory, setCalorieHistory] = useState<DailyHistory[]>([]);
  const [calorieDate, setCalorieDate] = useState(() => getVietnamLocalDate());
  const [manualCalories, setManualCalories] = useState('');
  const [calorieNote, setCalorieNote] = useState('');
  const [isSubmittingCalories, setIsSubmittingCalories] = useState(false);

  // Weight State
  const [weightHistory, setWeightHistory] = useState<WeightRecord[]>([]);
  const [weightDate, setWeightDate] = useState(() => getVietnamLocalDate());
  const [inputWeight, setInputWeight] = useState('');
  const [isSubmittingWeight, setIsSubmittingWeight] = useState(false);

  // Fluctuation Alert Modal State
  const [fluctuationAlert, setFluctuationAlert] = useState<{
    diffKg: number;
    percentDiff: number;
    pendingWeight: number;
    pendingDate: string;
  } | null>(null);
  const [fluctuationConfirmed, setFluctuationConfirmed] = useState(false);

  const fetchTrackingData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const [historyCalRes, todayCalRes, weightHistRes, userMeRes] = await Promise.allSettled([
        api.get('/tracking/calories'),
        api.get('/tracking/calories/today'),
        api.get('/tracking/weight-history'),
        api.get('/users/me')
      ]);

      if (historyCalRes.status === 'fulfilled') {
        const result = historyCalRes.value.data?.result;
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

        setCalorieHistory(mapped);
        if (result?.targetCalories) {
          setTargetCalories(Number(result.targetCalories));
        }
      }

      if (todayCalRes.status === 'fulfilled') {
        const t = todayCalRes.value.data?.result;
        if (t) {
          setTodayCalories(Number(t.caloriesConsumed || 0));
          if (t.targetCalories) {
            setTargetCalories(Number(t.targetCalories));
          }
        }
      }

      if (weightHistRes.status === 'fulfilled') {
        const rawWeights = weightHistRes.value.data?.result;
        if (Array.isArray(rawWeights)) {
          const sorted = rawWeights
            .map((w: any) => ({
              date: w.date ? String(w.date).slice(0, 10) : '',
              weightKg: Number(w.weightKg || w.weight || 0),
              note: w.note
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          setWeightHistory(sorted);
        }
      }

      if (userMeRes.status === 'fulfilled') {
        const me = userMeRes.value.data?.result;
        if (me?.healthProfile?.targetCalories) {
          setTargetCalories(Number(me.healthProfile.targetCalories));
        }
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu nhật ký:', error);
      setWarning('Có lỗi xảy ra khi tải dữ liệu nhật ký thực phẩm và cân nặng.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrackingData();
  }, []);

  // Most recent weight
  const latestWeight = useMemo(() => {
    if (weightHistory.length === 0) return null;
    return weightHistory[weightHistory.length - 1];
  }, [weightHistory]);

  // Calorie calculations
  const remainingCalories = Math.max(0, targetCalories - todayCalories);
  const isExceededTarget = todayCalories > targetCalories;
  const calorieProgressPercent = Math.min(100, Math.round((todayCalories / (targetCalories || 1)) * 100));

  // Add Manual Calorie Log
  const handleAddManualCalories = async () => {
    const calories = Number(manualCalories);
    if (!calorieDate || !Number.isFinite(calories) || calories <= 0) {
      setWarning('Vui lòng nhập ngày và lượng calories hợp lệ (> 0).');
      return;
    }

    try {
      setIsSubmittingCalories(true);
      setWarning(null);

      await api.post('/tracking/calories', {
        date: calorieDate,
        caloriesConsumed: calories,
        note: calorieNote.trim()
      });

      setManualCalories('');
      setCalorieNote('');
      const [y, m, d] = calorieDate.split('-');
      setSuccessNotice(`Đã ghi nhận thêm ${calories} kcal vào ngày ${d}/${m}/${y}!`);
      setTimeout(() => setSuccessNotice(null), 3500);

      await fetchTrackingData();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể thêm nhật ký calories.');
    } finally {
      setIsSubmittingCalories(false);
    }
  };

  // Pre-check Weight Update for Fluctuations (NFR-HLT-004)
  const handleRequestUpdateWeight = async () => {
    const weightNum = Number(inputWeight);
    if (!weightDate || !Number.isFinite(weightNum) || weightNum < 30 || weightNum > 300) {
      setWarning('Vui lòng nhập số cân nặng hợp lệ trong khoảng từ 30kg đến 300kg.');
      return;
    }

    if (latestWeight) {
      const diffKg = Math.abs(weightNum - latestWeight.weightKg);
      const percentDiff = (diffKg / latestWeight.weightKg) * 100;
      const daysDiff =
        Math.abs(new Date(weightDate).getTime() - new Date(latestWeight.date).getTime()) / (1000 * 3600 * 24);

      // Fluctuation threshold: > 5% within 7 days, > 3kg within 7 days, hoặc biến động đột ngột >= 10kg (US-09)
      if ((daysDiff <= 7 && (percentDiff > 5 || diffKg > 3)) || diffKg >= 10) {
        setFluctuationAlert({
          diffKg: Number(diffKg.toFixed(1)),
          percentDiff: Number(percentDiff.toFixed(1)),
          pendingWeight: weightNum,
          pendingDate: weightDate
        });
        setFluctuationConfirmed(false);
        return;
      }
    }

    await executeWeightUpdate(weightNum, weightDate);
  };

  const executeWeightUpdate = async (w: number, d: string) => {
    try {
      setIsSubmittingWeight(true);
      setWarning(null);

      await api.put('/tracking/weight', {
        date: d,
        weightKg: w
      });

      setInputWeight('');
      setFluctuationAlert(null);
      setSuccessNotice(`Đã cập nhật cân nặng ${w}kg thành công!`);
      setTimeout(() => setSuccessNotice(null), 3500);

      await fetchTrackingData();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể cập nhật cân nặng.');
    } finally {
      setIsSubmittingWeight(false);
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

  // Chart data formatting
  const chartData = weightHistory.map((item) => ({
    date: new Date(item.date).toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric' }),
    weight: item.weightKg
  }));

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="user" />

      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Nhật ký dinh dưỡng & Cân nặng" userRole="Người dùng" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {/* Alerts */}
          {warning && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle size={18} className="shrink-0 text-red-600" />
              <span>{warning}</span>
            </div>
          )}

          {successNotice && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle2 size={18} className="shrink-0 text-green-600" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Calorie Exceeded Warning Badge (Icon + Text, NFR-USA-004) */}
          {isExceededTarget && (
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 flex items-center gap-3 shadow-xs">
              <AlertTriangle size={24} className="text-amber-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">Cảnh báo: Đã vượt mục tiêu calo trong ngày!</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Bạn đã nạp {todayCalories.toLocaleString('vi-VN')} kcal (vượt{' '}
                  {(todayCalories - targetCalories).toLocaleString('vi-VN')} kcal so với mục tiêu{' '}
                  {targetCalories.toLocaleString('vi-VN')} kcal). Hãy cân đối lại ở bữa tiếp theo hoặc tăng cường vận động.
                </p>
              </div>
            </div>
          )}

          {/* Calorie Tracking Dashboard */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white p-6 rounded-[28px] shadow-xs border border-gray-100 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Calories hôm nay</p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {todayCalories.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs font-bold text-gray-400">kcal</span>
                </p>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Tiến độ</span>
                  <span className="font-bold text-orange-600">{calorieProgressPercent}%</span>
                </div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isExceededTarget ? 'bg-amber-500' : 'bg-orange-500'
                    )}
                    style={{ width: `${calorieProgressPercent}%` }}
                  />
                </div>
              </div>
            </article>

            <article className="bg-white p-6 rounded-[28px] shadow-xs border border-gray-100 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mục tiêu mỗi ngày</p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {targetCalories.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs font-bold text-gray-400">kcal</span>
                </p>
              </div>
              <p className="text-xs text-gray-400 font-medium mt-4">
                Được tính toán chuẩn Mifflin-St Jeor & TDEE
              </p>
            </article>

            <article className="bg-white p-6 rounded-[28px] shadow-xs border border-gray-100 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Calories còn lại</p>
                <p
                  className={cn(
                    'text-3xl font-black mt-2',
                    remainingCalories > 0 ? 'text-green-600' : 'text-amber-600'
                  )}
                >
                  {remainingCalories.toLocaleString('vi-VN')}{' '}
                  <span className="text-xs font-bold text-gray-400">kcal</span>
                </p>
              </div>
              <p className="text-xs text-gray-400 font-medium mt-4">
                {remainingCalories > 0 ? 'Dư địa calo cho bữa ăn tiếp theo' : 'Đã đạt hạn mức cho ngày hôm nay'}
              </p>
            </article>
          </section>

          {/* Manual Calorie Entry Form */}
          <section className="bg-white p-8 rounded-[32px] shadow-xs border border-gray-100 space-y-6">
            <div className="flex items-center gap-3">
              <Plus size={22} className="text-gray-900" />
              <h2 className="text-xl font-black text-gray-900">Ghi nhận calories từ món ăn ngoài thực đơn</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                label="Ngày nạp"
                type="date"
                value={calorieDate}
                onChange={(e) => setCalorieDate(e.target.value)}
              />
              <Input
                label="Lượng calories (kcal)"
                type="number"
                placeholder="Ví dụ: 450"
                value={manualCalories}
                onChange={(e) => setManualCalories(e.target.value)}
              />
              <div className="md:col-span-2">
                <Input
                  label="Ghi chú món ăn"
                  placeholder="Ví dụ: Cơm trưa với gia đình, trà sữa ít đường..."
                  value={calorieNote}
                  onChange={(e) => setCalorieNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleAddManualCalories}
                disabled={isSubmittingCalories}
                className="rounded-xl px-6 h-11"
              >
                {isSubmittingCalories ? 'Đang lưu...' : 'Lưu vào nhật ký calories'}
              </Button>
            </div>
          </section>

          {/* Weight Tracking Section */}
          <section className="bg-white p-8 rounded-[32px] shadow-xs border border-gray-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Scale size={24} className="text-gray-900" />
                <div>
                  <h2 className="text-xl font-black text-gray-900">Theo dõi cân nặng thực tế</h2>
                  <p className="text-xs text-gray-500">Ghi chép cân nặng đều đặn để điều chỉnh calo mục tiêu</p>
                </div>
              </div>

              {latestWeight && (
                <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                  <span className="text-xs text-gray-500 font-bold uppercase">Cân nặng gần nhất:</span>
                  <span className="text-lg font-black text-gray-900">{latestWeight.weightKg} kg</span>
                  <span className="text-[11px] text-gray-400">
                    ({new Date(latestWeight.date).toLocaleDateString('vi-VN')})
                  </span>
                </div>
              )}
            </div>

            {/* Input Weight */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Input
                label="Ngày đo"
                type="date"
                value={weightDate}
                onChange={(e) => setWeightDate(e.target.value)}
              />
              <Input
                label="Cân nặng (kg)"
                type="number"
                step="0.1"
                placeholder="Ví dụ: 68.5"
                value={inputWeight}
                onChange={(e) => setInputWeight(e.target.value)}
              />
              <div className="flex items-end">
                <Button
                  onClick={handleRequestUpdateWeight}
                  disabled={isSubmittingWeight || !inputWeight}
                  className="w-full h-11 rounded-xl"
                >
                  {isSubmittingWeight ? 'Đang lưu...' : 'Cập nhật cân nặng'}
                </Button>
              </div>
            </div>

            {/* Weight Chart (Recharts) */}
            {chartData.length > 1 && (
              <div className="pt-6 space-y-2">
                <h3 className="text-sm font-bold text-gray-700">Biểu đồ tiến trình cân nặng</h3>
                <div className="h-[260px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '16px',
                          border: 'none',
                          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                        }}
                        formatter={(val: any) => [`${val} kg`, 'Cân nặng']}
                      />
                      <Area
                        type="monotone"
                        dataKey="weight"
                        stroke="#f97316"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#weightGrad)"
                        dot={{ r: 4, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Accessible Weight Data Table (NFR-USA-006) */}
            <div className="pt-4 space-y-2">
              <h3 className="text-sm font-bold text-gray-700">Bảng dữ liệu lịch sử cân nặng</h3>
              <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-400 uppercase font-bold">
                    <tr>
                      <th className="py-3 px-4">Ngày đo</th>
                      <th className="py-3 px-4">Cân nặng (kg)</th>
                      <th className="py-3 px-4">Biến động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-gray-700 font-semibold">
                    {weightHistory.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-gray-400">
                          Chưa có bản ghi cân nặng nào.
                        </td>
                      </tr>
                    ) : (
                      weightHistory
                        .slice()
                        .reverse()
                        .map((w, idx, arr) => {
                          const prev = arr[idx + 1];
                          const diff = prev ? Number((w.weightKg - prev.weightKg).toFixed(1)) : null;

                          return (
                            <tr key={idx} className="hover:bg-gray-50/50">
                              <td className="py-3 px-4">{new Date(w.date).toLocaleDateString('vi-VN')}</td>
                              <td className="py-3 px-4 font-bold text-gray-900">{w.weightKg} kg</td>
                              <td className="py-3 px-4">
                                {diff === null ? (
                                  <span className="text-gray-400">-</span>
                                ) : diff > 0 ? (
                                  <span className="text-amber-600 flex items-center gap-1 font-bold">
                                    <TrendingUp size={14} /> +{diff} kg
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="text-green-600 flex items-center gap-1 font-bold">
                                    <TrendingDown size={14} /> {diff} kg
                                  </span>
                                ) : (
                                  <span className="text-gray-400 flex items-center gap-1">
                                    <Minus size={14} /> 0 kg
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Fluctuation Confirmation Warning Modal (NFR-HLT-004) */}
      {fluctuationAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={26} />
              </div>
              <h3 className="text-xl font-black text-gray-900 leading-tight">
                Cảnh báo biến động cân nặng lớn!
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Số cân bạn vừa nhập (<strong>{fluctuationAlert.pendingWeight} kg</strong>) có mức chênh lệch{' '}
              <strong>{fluctuationAlert.diffKg} kg</strong> ({fluctuationAlert.percentDiff}%) so với bản ghi gần nhất{' '}
              (<strong>{latestWeight?.weightKg} kg</strong>).
            </p>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold">Lưu ý sức khỏe:</p>
              <p>Biến động cân nặng vượt quá 5% hoặc quá 3kg trong 1 tuần có thể do nhập nhầm số liệu hoặc tình trạng sức khỏe cần được theo dõi kỹ.</p>
            </div>

            <div className="pt-2">
              <Checkbox
                id="confirm-fluctuation"
                checked={fluctuationConfirmed}
                onChange={(e) => setFluctuationConfirmed(e.target.checked)}
                label="Tôi xác nhận số liệu cân nặng này là hoàn toàn chính xác."
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setFluctuationAlert(null)}
                className="rounded-xl px-5 text-sm"
              >
                Hủy bỏ
              </Button>
              <Button
                disabled={!fluctuationConfirmed || isSubmittingWeight}
                onClick={() => executeWeightUpdate(fluctuationAlert.pendingWeight, fluctuationAlert.pendingDate)}
                className="rounded-xl px-5 text-sm bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isSubmittingWeight ? 'Đang lưu...' : 'Xác nhận cập nhật'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
