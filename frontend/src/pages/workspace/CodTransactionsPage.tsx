import { useState, useEffect } from 'react';
import { Receipt, RefreshCw, Search, DollarSign, ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

export default function CodTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workspace/transactions');
      setTransactions(res.data?.result?.items || res.data?.result || []);
    } catch (err) {
      console.error('Lỗi tải sổ giao dịch COD:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filtered = transactions.filter((t) => {
    const matchesSearch =
      !searchTerm ||
      t.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.reference?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || t.type === filterType || t.action === filterType;
    return matchesSearch && matchesType;
  });

  const totalCollected = transactions
    .filter((t) => t.type === 'Collect' || t.action === 'Collect')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalRefunded = transactions
    .filter((t) => t.type === 'Refund' || t.action === 'Refund')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div className="flex min-h-screen bg-[#faf8f5] relative overflow-hidden">
      <Sidebar role="manager" />

      <div className="flex-1 flex flex-col min-w-0 z-10">
        <Header title="Sổ giao dịch COD (WF-24A)" userRole="Quản lý Vận hành" hideSearch={true} />

        <main className="p-8 space-y-6 overflow-y-auto min-w-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[24px] border border-white/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-teal-600">
                <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Tổng COD Đã Thu</span>
                <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
                  <ArrowDownLeft size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-gray-900">{totalCollected.toLocaleString('vi-VN')} đ</p>
            </div>

            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[24px] border border-white/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-amber-600">
                <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Tổng Hoàn Trả COD</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                  <ArrowUpRight size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-gray-900">{totalRefunded.toLocaleString('vi-VN')} đ</p>
            </div>

            <div className="bg-white/90 backdrop-blur-md p-6 rounded-[24px] border border-white/80 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-blue-600">
                <span className="text-xs font-extrabold text-gray-500 uppercase tracking-wider">Số Lượng Giao Dịch</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Receipt size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-gray-900">{transactions.length} giao dịch</p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-white/90 backdrop-blur-md p-4 rounded-3xl border border-white/80 shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto">
              {['all', 'Collect', 'Refund'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterType(st)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                    filterType === st
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200/80'
                  }`}
                >
                  {st === 'all' ? 'Tất cả' : st === 'Collect' ? 'Thu bù COD' : 'Hoàn trả COD'}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Tìm mã đơn hoặc tham chiếu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-50/50 border border-gray-200 rounded-2xl text-xs focus:outline-none w-full sm:w-64"
              />
            </div>
          </div>

          {/* Transactions List */}
          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <Loader2 className="animate-spin mx-auto text-teal-600 mb-2" size={36} />
              <p className="text-sm font-semibold">Đang tải lịch sử sổ giao dịch COD...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center bg-white/90 backdrop-blur-md rounded-3xl border border-white/80 shadow-xs space-y-3">
              <Receipt className="mx-auto text-gray-300" size={48} />
              <h3 className="text-lg font-bold text-gray-800">Không có giao dịch nào</h3>
              <p className="text-xs text-gray-400">Chưa ghi nhận đối soát giao dịch COD nào.</p>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur-md rounded-[28px] border border-white/80 shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-black uppercase text-gray-400 tracking-wider">
                    <th className="p-4 pl-6">Mã đơn</th>
                    <th className="p-4">Loại giao dịch</th>
                    <th className="p-4">Số tiền</th>
                    <th className="p-4">Mã tham chiếu</th>
                    <th className="p-4">Lý do</th>
                    <th className="p-4 pr-6">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-700">
                  {filtered.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                      <td className="p-4 pl-6 font-mono font-black text-teal-600">
                        #{item.orderId?.slice(-8) || item._id?.slice(-8)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            item.type === 'Collect' || item.action === 'Collect'
                              ? 'bg-teal-50 text-teal-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {item.type === 'Collect' || item.action === 'Collect' ? 'Thu tiền' : 'Hoàn tiền'}
                        </span>
                      </td>
                      <td className="p-4 font-mono font-black text-gray-900">
                        {Number(item.amount || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-4 text-gray-500 font-mono text-[11px]">
                        {item.reference || 'N/A'}
                      </td>
                      <td className="p-4 text-gray-600 max-w-xs truncate">{item.reason || 'Đối soát COD'}</td>
                      <td className="p-4 pr-6 text-gray-400 text-[11px]">
                        {item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : 'Mới đây'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}