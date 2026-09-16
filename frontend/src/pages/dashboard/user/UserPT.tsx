import { useEffect, useMemo, useState } from 'react';
import { Dumbbell, Loader2, Search, Star, UserRound } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

type PTService = {
  _id: string;
  title?: string;
  description?: string;
  sessions?: number;
  durationDays?: number;
  price?: number;
};

type PTSuggestion = {
  _id: string;
  username?: string;
  email?: string;
  ptProfile?: {
    experienceYears?: number;
    specialties?: string[];
    rating?: number;
    portfolioImages?: string[];
  };
};

export default function UserPT() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [packageSearchQuery, setPackageSearchQuery] = useState('');
  const [registeringServiceId, setRegisteringServiceId] = useState<string | null>(null);

  const [services, setServices] = useState<PTService[]>([]);
  const [availableServices, setAvailableServices] = useState<PTService[]>([]);
  const [suggestions, setSuggestions] = useState<PTSuggestion[]>([]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const [registeredServiceRes, allServiceRes, suggestionRes] = await Promise.allSettled([
        api.get('/users/me/pt-services'),
        api.get('/pt/services?limit=120&page=1'),
        api.get('/users/recommendations/pts?limit=10')
      ]);

      if (registeredServiceRes.status === 'fulfilled') {
        const items = registeredServiceRes.value.data?.result?.services;
        setServices(Array.isArray(items) ? items : []);
      }

      if (allServiceRes.status === 'fulfilled') {
        const items = allServiceRes.value.data?.result?.services;
        setAvailableServices(Array.isArray(items) ? items : []);
      }

      if (suggestionRes.status === 'fulfilled') {
        const items = suggestionRes.value.data?.result?.suggestions;
        setSuggestions(Array.isArray(items) ? items : []);
      } else {
        setWarning('Chưa có dữ liệu gợi ý PT. Vui lòng cập nhật hồ sơ sức khỏe để nhận đề xuất.');
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu PT:', error);
      setWarning('Không thể tải dữ liệu PT lúc này.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const registeredServiceIds = useMemo(() => {
    return new Set(services.map((service) => String(service._id)));
  }, [services]);

  const filteredAvailableServices = useMemo(() => {
    const keyword = packageSearchQuery.trim().toLowerCase();
    if (!keyword) return availableServices;

    return availableServices.filter((service) => {
      const title = service.title?.toLowerCase() || '';
      const description = service.description?.toLowerCase() || '';
      return title.includes(keyword) || description.includes(keyword);
    });
  }, [availableServices, packageSearchQuery]);

  const handleRegisterService = async (service: PTService) => {
    const serviceId = String(service._id);
    if (!serviceId || registeredServiceIds.has(serviceId)) return;

    try {
      setRegisteringServiceId(serviceId);
      setSuccessMessage(null);
      setWarning(null);

      await api.post(`/users/me/pt-services/${serviceId}/register`);
      const registeredServiceRes = await api.get('/users/me/pt-services');
      const registeredItems = registeredServiceRes.data?.result?.services;
      setServices(Array.isArray(registeredItems) ? registeredItems : []);
      setSuccessMessage(`Đăng ký thành công gói "${service.title || 'PT'}".`);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Không thể đăng ký gói PT này.');
    } finally {
      setRegisteringServiceId(null);
    }
  };

  const filteredSuggestions = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return suggestions;

    return suggestions.filter((pt) => {
      const name = pt.username?.toLowerCase() || '';
      const email = pt.email?.toLowerCase() || '';
      const specialties = (pt.ptProfile?.specialties || []).join(' ').toLowerCase();
      return name.includes(keyword) || email.includes(keyword) || specialties.includes(keyword);
    });
  }, [searchQuery, suggestions]);

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
        <Header title="Gói huấn luyện & Huấn luyện viên" userRole="Người dùng" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              {successMessage}
            </div>
          ) : null}

          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center gap-3">
              <Dumbbell size={22} className="text-gray-900" />
              <h2 className="text-xl font-black text-gray-900">Gói huấn luyện đã đăng ký</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {services.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  Bạn chưa đăng ký gói huấn luyện nào.
                </div>
              ) : (
                services.map((service) => (
                  <article key={service._id} className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <p className="text-sm font-black text-gray-900">{service.title || 'Gói PT'}</p>
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{service.description || 'Không có mô tả'}</p>
                    <div className="mt-4 space-y-1 text-xs font-semibold text-gray-600">
                      <p>Số buổi: {Number(service.sessions || 0)}</p>
                      <p>Thời hạn: {Number(service.durationDays || 0)} ngày</p>
                      <p>Giá: {Number(service.price || 0).toLocaleString('vi-VN')} đ</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Dumbbell size={22} className="text-gray-900" />
                <h2 className="text-xl font-black text-gray-900">Các gói PT hiện có</h2>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Tìm theo tên gói hoặc mô tả..."
                  icon={<Search size={16} />}
                  value={packageSearchQuery}
                  onChange={(e) => setPackageSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredAvailableServices.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  Không có gói PT phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredAvailableServices.map((service) => {
                  const isRegistered = registeredServiceIds.has(String(service._id));
                  const isRegistering = registeringServiceId === String(service._id);

                  return (
                    <article key={service._id} className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-black text-gray-900">{service.title || 'Gói PT'}</p>
                        {isRegistered ? (
                          <span className="inline-flex rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            Đã đăng ký
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-2 line-clamp-3 text-xs text-gray-500">{service.description || 'Không có mô tả'}</p>

                      <div className="mt-4 space-y-1 text-xs font-semibold text-gray-600">
                        <p>Số buổi: {Number(service.sessions || 0)}</p>
                        <p>Thời hạn: {Number(service.durationDays || 0)} ngày</p>
                        <p>Giá: {Number(service.price || 0).toLocaleString('vi-VN')} đ</p>
                      </div>

                      <Button
                        className="mt-4 h-10 w-full rounded-xl"
                        disabled={isRegistered || isRegistering}
                        onClick={() => handleRegisterService(service)}
                      >
                        {isRegistered ? 'Bạn đã đăng ký' : isRegistering ? 'Đang đăng ký...' : 'Đăng ký gói này'}
                      </Button>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-50 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <UserRound size={22} className="text-gray-900" />
                <h2 className="text-xl font-black text-gray-900">Danh sách huấn luyện viên gợi ý</h2>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Tìm theo tên, email, chuyên môn..."
                  icon={<Search size={16} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSuggestions.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  Không có PT phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                filteredSuggestions.map((pt) => (
                  <article key={pt._id} className="rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-gray-900">{pt.username || 'Huấn luyện viên'}</p>
                        <p className="text-xs font-medium text-gray-500 mt-1">{pt.email || 'N/A'}</p>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-lg bg-yellow-50 px-2 py-1 text-xs font-bold text-yellow-700">
                        <Star size={12} className="fill-yellow-500 text-yellow-500" />
                        {Number(pt.ptProfile?.rating || 0).toFixed(1)}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-gray-600">
                      <p>
                        Kinh nghiệm: <span className="font-bold">{Number(pt.ptProfile?.experienceYears || 0)} năm</span>
                      </p>
                      <p className="line-clamp-2">
                        Chuyên môn: <span className="font-bold">{(pt.ptProfile?.specialties || []).join(', ') || 'Chưa cập nhật'}</span>
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
