import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

type PTService = {
  _id: string;
  ptId?: string | { $oid?: string; toString?: () => string };
  title: string;
  description: string;
  price: number;
  sessions: number;
  durationDays: number;
  isActive: boolean;
};

type MeProfile = {
  _id: string;
  username?: string;
};

type ServiceForm = {
  title: string;
  description: string;
  price: string;
  sessions: string;
  durationDays: string;
  isActive: boolean;
};

const emptyForm: ServiceForm = {
  title: '',
  description: '',
  price: '',
  sessions: '',
  durationDays: '',
  isActive: true
};

export default function PTMenu() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [services, setServices] = useState<PTService[]>([]);
  const [me, setMe] = useState<MeProfile | null>(null);

  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const meRes = await api.get('/users/me');
      const profile = meRes.data?.result;
      let servicesRes;
      try {
        servicesRes = await api.get('/pt/my-services?limit=100&page=1');
      } catch (error: any) {
        // Fallback de tranh vo trang neu backend route quan ly chua san sang.
        if (error?.response?.status === 404) {
          servicesRes = await api.get('/pt/services?limit=100&page=1');
        } else {
          throw error;
        }
      }

      const allServices = servicesRes.data?.result?.services;

      setMe(profile || null);

      const normalizedServices = Array.isArray(allServices) ? allServices : [];
      const normalizeId = (value: unknown): string => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value !== null) {
          const asRecord = value as Record<string, any>;
          if (typeof asRecord.$oid === 'string') return asRecord.$oid;
          if (typeof asRecord.toString === 'function') {
            const id = asRecord.toString();
            return typeof id === 'string' ? id : '';
          }
        }
        return '';
      };

      const ownServices = normalizedServices.filter((service: any) => {
        const ownerId = normalizeId(service?.ptId);
        const currentUserId = normalizeId(profile?._id);
        return ownerId && currentUserId ? ownerId === currentUserId : true;
      });
      setServices(ownServices);
    } catch (error) {
      console.error('Lỗi tải dữ liệu PT:', error);
      setWarning('Không thể tải danh sách gói PT. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        service.title.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query);
      const matchesTab =
        activeTab === 'all' ||
        (activeTab === 'active' && service.isActive) ||
        (activeTab === 'inactive' && !service.isActive);
      return matchesSearch && matchesTab;
    });
  }, [services, searchQuery, activeTab]);

  const openCreateModal = () => {
    setEditingServiceId(null);
    setForm(emptyForm);
    setWarning(null);
    setShowFormModal(true);
  };

  const openEditModal = (service: PTService) => {
    setEditingServiceId(service._id);
    setForm({
      title: service.title,
      description: service.description,
      price: String(service.price || 0),
      sessions: String(service.sessions || 0),
      durationDays: String(service.durationDays || 0),
      isActive: Boolean(service.isActive)
    });
    setWarning(null);
    setShowFormModal(true);
  };

  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setWarning(null);

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        price: Number(form.price || 0),
        sessions: Number(form.sessions || 0),
        durationDays: Number(form.durationDays || 0),
        isActive: form.isActive
      };

      if (!payload.title || !payload.description || payload.price <= 0 || payload.sessions <= 0 || payload.durationDays <= 0) {
        setWarning('Vui lòng nhập đầy đủ thông tin và các giá trị lớn hơn 0.');
        return;
      }

      if (editingServiceId) {
        const res = await api.patch(`/pt/services/${editingServiceId}`, payload);
        const updated = res.data?.result as PTService | undefined;
        if (updated) {
          setServices((prev) => prev.map((item) => (item._id === editingServiceId ? { ...item, ...updated } : item)));
        }
      } else {
        const res = await api.post('/pt/services', payload);
        const created = res.data?.result as PTService | undefined;
        if (created) {
          setServices((prev) => [created, ...prev]);
        } else {
          await fetchData();
        }
      }

      setShowFormModal(false);
      setForm(emptyForm);
      setEditingServiceId(null);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể lưu gói PT.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (serviceId: string) => {
    try {
      const res = await api.delete(`/pt/services/${serviceId}`);
      const updated = res.data?.result as PTService | undefined;
      if (updated) {
        setServices((prev) => prev.map((item) => (item._id === serviceId ? { ...item, ...updated } : item)));
      } else {
        setServices((prev) => prev.map((item) => (item._id === serviceId ? { ...item, isActive: false } : item)));
      }
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể xóa gói PT này.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar role="pt" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  const modalTitle = editingServiceId ? 'Cập nhật gói PT' : 'Tạo gói PT mới';

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="pt" />
      
      <div className="flex-1 flex flex-col">
        <Header title="Quản lý gói PT" userName={me?.username} userRole="Huấn luyện viên" hideSearch={true} />
        
        <main className="p-8 space-y-8 overflow-y-auto">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
              <button 
                onClick={() => setActiveTab('all')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                  activeTab === 'all' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Tất cả
              </button>
              <button 
                onClick={() => setActiveTab('active')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                  activeTab === 'active' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Đang hoạt động
              </button>
              <button
                onClick={() => setActiveTab('inactive')}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                  activeTab === 'inactive' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Đã ẩn
              </button>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm thực đơn..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-6 py-3 bg-white border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 w-64 transition-all shadow-sm"
                />
              </div>
              <button 
                onClick={openCreateModal}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-indigo-200"
              >
                <Plus size={20} />
                Tạo gói PT
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredServices.map((service) => (
              <article key={service._id} className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-black text-gray-900 leading-snug">{service.title}</h3>
                  <span className={cn(
                    'px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider',
                    service.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  )}>
                    {service.isActive ? 'Đang hoạt động' : 'Đã ẩn'}
                  </span>
                </div>

                <p className="text-sm text-gray-600 line-clamp-3">{service.description}</p>

                <div className="grid grid-cols-3 gap-2 text-center py-3 border-y border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Buổi</p>
                    <p className="text-sm font-black text-gray-900">{service.sessions}</p>
                  </div>
                  <div className="border-x border-gray-100">
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Ngày</p>
                    <p className="text-sm font-black text-gray-900">{service.durationDays}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Giá</p>
                    <p className="text-sm font-black text-gray-900">{Math.round(service.price || 0).toLocaleString('vi-VN')} đ</p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(service)}
                    className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={14} /> Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(service._id)}
                    className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={14} /> Ẩn
                  </button>
                </div>
              </article>
            ))}
          </div>
          
          {filteredServices.length === 0 && (
            <div className="text-center py-20">
              <p className="text-gray-400 font-bold">Không tìm thấy gói PT phù hợp...</p>
            </div>
          )}
        </main>
      </div>

      {showFormModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowFormModal(false)} />
          <div className="relative bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-8 space-y-8 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-gray-900">{modalTitle}</h3>
              <button onClick={() => setShowFormModal(false)} className="p-2 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-100 transition-all">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tên gói PT</label>
                <input 
                  type="text" 
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="VD: PT ăng Cân 12 Buổi" 
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mô tả</label>
                <textarea
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Giá (VND)</label>
                  <input 
                    type="number" 
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="500000" 
                    className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Số buổi</label>
                  <input 
                    type="number" 
                    value={form.sessions}
                    onChange={(e) => setForm({ ...form, sessions: e.target.value })}
                    placeholder="12" 
                    className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Số ngày</label>
                  <input 
                    type="number" 
                    value={form.durationDays}
                    onChange={(e) => setForm({ ...form, durationDays: e.target.value })}
                    placeholder="30" 
                    className="w-full px-4 py-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-bold" 
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Đang mở bán
              </label>

              <Button type="submit" disabled={isSaving} className="w-full py-8 bg-indigo-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-95 transition-all">
                {isSaving ? 'Đang lưu...' : editingServiceId ? 'Lưu thay đổi' : 'Tạo gói PT'}
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
