import { useState, FormEvent } from 'react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Megaphone, Package, Server, Truck, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const initialExpenses = [
  { id: 1, date: '10/04/2026', category: 'Quảng cáo', note: 'Facebook Ads Campaign April', amount: '2.000.000 đ', admin: 'Admin_Lan' },
];

export default function FinanceExpenses() {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    category: 'Quảng cáo',
    note: '',
    amount: ''
  });

  const kpiExpenses = [
    { name: 'Quảng cáo (Ads)', amount: '5.000.000 đ', icon: <Megaphone />, color: 'bg-red-500' },
    { name: 'Nguyên liệu', amount: '3.000.000 đ', icon: <Package />, color: 'bg-orange-500' },
    { name: 'Server & Vận hành', amount: '500.000 đ', icon: <Server />, color: 'bg-blue-500' },
    { name: 'Trả cho Shipper', amount: '500.000 đ', icon: <Truck />, color: 'bg-purple-500' },
  ];

  const handleAddExpense = (e: FormEvent) => {
    e.preventDefault();
    const newExpense = {
      id: Date.now(),
      date: new Date().toLocaleDateString('vi-VN'),
      category: formData.category,
      note: formData.note,
      amount: parseInt(formData.amount).toLocaleString('vi-VN') + ' đ',
      admin: 'Admin_Lan'
    };
    setExpenses([newExpense, ...expenses]);
    setShowAddModal(false);
    setFormData({ category: 'Quảng cáo', note: '', amount: '' });
  };

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col">
        <Header title="Quản lý Chi phí" userRole="Quản trị viên" hideSearch={true} />
        <main className="p-8 space-y-8 overflow-y-auto">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-gray-900">Danh sách chi phí vận hành</h2>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-2xl text-sm font-black hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
            >
              <Plus size={18} />
              Nhập chi phí mới
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpiExpenses.map((exp, i) => (
              <div key={i} className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-50 space-y-4">
                <div className={`w-10 h-10 ${exp.color} text-white rounded-xl flex items-center justify-center`}>
                  {exp.icon}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{exp.name}</p>
                  <p className="text-xl font-black text-gray-900">{exp.amount}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-[40px] shadow-sm border border-gray-50 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50 bg-gray-50/50">
                  <th className="p-6">Ngày</th>
                  <th className="p-6">Loại chi phí</th>
                  <th className="p-6">Nội dung</th>
                  <th className="p-6">Số tiền</th>
                  <th className="p-6">Người nhập</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="text-sm hover:bg-gray-50/50 transition-colors">
                    <td className="p-6 text-gray-500 font-medium">{exp.date}</td>
                    <td className="p-6 font-bold text-gray-900">{exp.category}</td>
                    <td className="p-6 text-gray-500">{exp.note}</td>
                    <td className="p-6 font-black text-red-500">{exp.amount}</td>
                    <td className="p-6 font-bold text-gray-900">{exp.admin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-8 space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-gray-900">Nhập chi phí mới</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-all">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Loại chi phí</label>
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#c1e06d] focus:bg-white rounded-2xl outline-none transition-all font-bold"
                >
                  <option>Quảng cáo</option>
                  <option>Nguyên liệu</option>
                  <option>Server & Vận hành</option>
                  <option>Trả cho Shipper</option>
                  <option>Khác</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Số tiền (VNĐ)</label>
                <input 
                  type="number" 
                  required
                  placeholder="VD: 500000"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#c1e06d] focus:bg-white rounded-2xl outline-none transition-all font-bold" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ghi chú / Nội dung</label>
                <textarea 
                  required
                  rows={3}
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#c1e06d] focus:bg-white rounded-2xl outline-none transition-all font-bold resize-none" 
                  placeholder="Nhập chi tiết chi phí..."
                />
              </div>

              <Button type="submit" className="w-full py-8 bg-gray-900 text-white rounded-3xl font-black text-lg shadow-xl shadow-gray-200 hover:bg-gray-800 hover:scale-[1.02] active:scale-95 transition-all">
                Lưu chi phí
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
