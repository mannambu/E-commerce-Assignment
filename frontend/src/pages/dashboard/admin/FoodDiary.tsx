import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Flame, Loader2, Search, UserCircle2 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type FoodDiaryRow = {
  userId: string;
  date: string;
  totalCalories: number;
  sources: {
    Order: number;
    Manual: number;
    Legacy: number;
  };
  entriesCount: number;
  user: {
    username: string;
    email: string;
    role: 'Customer' | 'PT' | 'Admin';
  };
};

type FoodDiaryResponse = {
  days: number;
  since: string;
  summary: {
    totalRows: number;
    totalCalories: number;
    orderCalories: number;
    manualCalories: number;
    legacyCalories: number;
  };
  items: FoodDiaryRow[];
};

export default function AdminFoodDiary() {
  const [days, setDays] = useState('14');
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'order' | 'manual' | 'legacy'>('all');

  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [data, setData] = useState<FoodDiaryResponse | null>(null);

  const fetchDiary = async (selectedDays: string) => {
    try {
      setIsLoading(true);
      setWarning(null);

      const safeDays = Number(selectedDays);
      const queryDays = Number.isFinite(safeDays) ? Math.max(1, Math.min(60, safeDays)) : 14;

      const res = await api.get(`/admin/food-diary?days=${queryDays}`);
      setData(res.data?.result || null);
    } catch (error: any) {
      console.error('Loi tai admin food diary:', error);
      setWarning(error?.response?.data?.message || 'Khong the tai du lieu nhat ky thuc pham.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiary(days);
  }, []);

  const rows = useMemo(() => {
    const allRows = data?.items || [];
    const query = searchQuery.trim().toLowerCase();

    return allRows.filter((row) => {
      const matchesSearch =
        !query ||
        row.user.username.toLowerCase().includes(query) ||
        row.user.email.toLowerCase().includes(query) ||
        row.userId.toLowerCase().includes(query);

      const sourceCalories = {
        order: Number(row.sources.Order || 0),
        manual: Number(row.sources.Manual || 0),
        legacy: Number(row.sources.Legacy || 0)
      };

      const matchesSource =
        sourceFilter === 'all' ||
        (sourceFilter === 'order' && sourceCalories.order > 0) ||
        (sourceFilter === 'manual' && sourceCalories.manual > 0) ||
        (sourceFilter === 'legacy' && sourceCalories.legacy > 0);

      return matchesSearch && matchesSource;
    });
  }, [data, searchQuery, sourceFilter]);

  const summary = data?.summary;

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
        <Header title="Nhat ky thuc pham he thong" userRole="Quan tri vien" hideSearch={true} />

        <main className="p-8 space-y-6 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tong calorie</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(summary?.totalCalories || 0).toLocaleString('vi-VN')}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tu don hang</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(summary?.orderCalories || 0).toLocaleString('vi-VN')}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nhap tay</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(summary?.manualCalories || 0).toLocaleString('vi-VN')}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Du lieu cu</p>
              <p className="text-2xl font-black text-gray-900 mt-2">{Math.round(summary?.legacyCalories || 0).toLocaleString('vi-VN')}</p>
            </div>
          </section>

          <section className="bg-white rounded-[28px] shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full md:w-[22rem]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tim theo user, email, userId..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-orange-500/10"
                />
              </div>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'all' | 'order' | 'manual' | 'legacy')}
                className="h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-orange-500/10"
              >
                <option value="all">Tat ca nguon</option>
                <option value="order">Tu don hang</option>
                <option value="manual">Nhap tay</option>
                <option value="legacy">Du lieu cu</option>
              </select>

              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-24 h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-orange-500/10"
                />
                <button
                  type="button"
                  onClick={() => fetchDiary(days)}
                  className="h-11 px-4 rounded-xl bg-[#c1e06d] text-gray-900 text-sm font-black hover:bg-[#b1d05d] transition-colors"
                >
                  Tai lai
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 inline-flex items-center gap-2">
              <CalendarDays size={14} />
              Dang hien thi du lieu {data?.days || 14} ngay gan nhat, tu {data?.since ? new Date(data.since).toLocaleDateString('vi-VN') : 'N/A'}.
            </div>
          </section>

          <section className="bg-white rounded-[28px] shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/40 border-b border-gray-100">
                  <th className="px-6 py-4">Nguoi dung</th>
                  <th className="px-6 py-4">Ngay</th>
                  <th className="px-6 py-4">Tong calorie</th>
                  <th className="px-6 py-4">Order</th>
                  <th className="px-6 py-4">Manual</th>
                  <th className="px-6 py-4">Legacy</th>
                  <th className="px-6 py-4">So ban ghi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">
                      Khong tim thay dong log phu hop.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.userId}-${row.date}`} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <UserCircle2 size={16} className="text-gray-400" />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{row.user.username}</p>
                            <p className="text-[11px] text-gray-500">{row.user.email || row.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{new Date(row.date).toLocaleDateString('vi-VN')}</td>
                      <td className="px-6 py-4 text-sm font-black text-gray-900 inline-flex items-center gap-1">
                        <Flame size={14} className="text-orange-500" />
                        {Math.round(row.totalCalories).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-6 py-4 text-sm text-blue-700 font-semibold">{Math.round(row.sources.Order || 0).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-4 text-sm text-green-700 font-semibold">{Math.round(row.sources.Manual || 0).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-semibold">{Math.round(row.sources.Legacy || 0).toLocaleString('vi-VN')}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{row.entriesCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </main>
      </div>
    </div>
  );
}
