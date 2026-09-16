import { useState } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { CreditCard, CheckCircle2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const payoutList = [
  { id: 'PAY-001', pt: 'Lê Văn Cường', amount: '2.572.000 đ', status: 'Pending', date: '11/04/2026' },
  { id: 'PAY-002', pt: 'Nguyễn Văn An', amount: '1.780.000 đ', status: 'Completed', date: '10/04/2026' },
  { id: 'PAY-003', pt: 'Trần Thị Bình', amount: '3.200.000 đ', status: 'Pending', date: '11/04/2026' },
];

export default function FinancePayouts() {
  const [payouts, setPayouts] = useState(payoutList);

  const handlePay = (id: string) => {
    setPayouts(prev => prev.map(p => p.id === id ? { ...p, status: 'Completed' } : p));
    alert('Đã xác nhận thanh toán cho PT!');
  };

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col">
        <Header title="Đối soát & Thanh toán PT" userRole="Quản trị viên" hideSearch={true} />
        <main className="p-8 space-y-8">
          <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
            <div className="p-8 border-b border-gray-50">
              <h2 className="text-xl font-black text-gray-900">Yêu cầu rút tiền từ PT</h2>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 bg-gray-50/50">
                  <th className="p-6">Mã yêu cầu</th>
                  <th className="p-6">Huấn luyện viên</th>
                  <th className="p-6">Số tiền thực nhận</th>
                  <th className="p-6">Ngày yêu cầu</th>
                  <th className="p-6">Trạng thái</th>
                  <th className="p-6">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payouts.map((pay) => (
                  <tr key={pay.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="p-6 text-sm font-bold text-blue-500">{pay.id}</td>
                    <td className="p-6 text-sm font-bold text-gray-900">{pay.pt}</td>
                    <td className="p-6 text-sm font-black text-gray-900">{pay.amount}</td>
                    <td className="p-6 text-sm text-gray-500 font-medium">{pay.date}</td>
                    <td className="p-6">
                      <span className={cn(
                        "text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-wider",
                        pay.status === 'Pending' ? "bg-orange-50 text-orange-500" : "bg-green-50 text-green-600"
                      )}>
                        {pay.status === 'Pending' ? 'Chờ xử lý' : 'Đã thanh toán'}
                      </span>
                    </td>
                    <td className="p-6">
                      {pay.status === 'Pending' ? (
                        <button 
                          onClick={() => handlePay(pay.id)}
                          className="flex items-center gap-2 px-4 py-2 bg-[#c1e06d] text-gray-900 text-[10px] font-black rounded-xl shadow-sm hover:bg-[#b1d05d] transition-all"
                        >
                          <CheckCircle2 size={14} />
                          Xác nhận thanh toán
                        </button>
                      ) : (
                        <span className="text-gray-400 font-bold text-[10px] uppercase">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
