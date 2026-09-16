import { useState, useMemo } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Search, Download, Filter, Receipt } from 'lucide-react';

const transactions = [
  { id: 'TNX12', user: 'Nguyễn Văn An', method: 'OCB', amount: '254.000 đ', date: '02/04/2026', status: 'Thành công' },
  { id: 'TNX23', user: 'Trần Thị Bình', method: 'VNPay', amount: '675.000 đ', date: '30/03/2026', status: 'Thành công' },
  { id: 'TNX34', user: 'Lê Văn Cường', method: 'MoMo', amount: '100.000 đ', date: '30/03/2026', status: 'Thất bại' },
  { id: 'TNX45', user: 'Phạm Minh Đức', method: 'VNPay', amount: '150.000 đ', date: '29/03/2026', status: 'Thành công' },
];

export default function FinanceTransactions() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tnx => 
      tnx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tnx.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tnx.method.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const handleExport = () => {
    alert('Đang xuất báo cáo giao dịch sang file CSV/Excel...');
  };

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col">
        <Header title="Quản lý Hóa đơn & Giao dịch" userRole="Quản trị viên" hideSearch={true} />
        <main className="p-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Tìm mã GD, khách hàng..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#c1e06d]/20 w-80"
                />
              </div>
              <button className="p-2 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-gray-900 transition-all">
                <Filter size={18} />
              </button>
            </div>
            <button 
              onClick={handleExport}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
            >
              <Download size={18} />
              Export to Excel/CSV
            </button>
          </div>

          <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 bg-gray-50/50">
                  <th className="p-6">Mã Giao dịch</th>
                  <th className="p-6">Khách hàng</th>
                  <th className="p-6">Phương thức</th>
                  <th className="p-6">Số tiền</th>
                  <th className="p-6">Ngày</th>
                  <th className="p-6">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTransactions.map((tnx) => (
                  <tr key={tnx.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="p-6 text-sm font-bold text-gray-900">{tnx.id}</td>
                    <td className="p-6 text-sm font-bold text-gray-900">{tnx.user}</td>
                    <td className="p-6">
                      <span className="px-2 py-1 bg-gray-100 rounded-lg text-[10px] font-black text-gray-500 uppercase">{tnx.method}</span>
                    </td>
                    <td className="p-6 text-sm font-black text-gray-900">{tnx.amount}</td>
                    <td className="p-6 text-sm text-gray-500 font-medium">{tnx.date}</td>
                    <td className="p-6">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wider ${
                        tnx.status === 'Thành công' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                      }`}>
                        {tnx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredTransactions.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400 font-bold">Không tìm thấy giao dịch nào...</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
