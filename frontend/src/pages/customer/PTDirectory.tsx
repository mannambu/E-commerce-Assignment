import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Dumbbell } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import { Input } from '@/components/ui/Input';
import api from '@/services/api';
import { Link } from 'react-router-dom';

type PTService = {
  _id: string;
  title?: string;
  description?: string;
  sessions?: number;
  durationDays?: number;
  price?: number;
  ptId?: string;
};

export default function PTDirectory() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [services, setServices] = useState<PTService[]>([]);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        setWarning(null);

        const res = await api.get('/pt/services?limit=60&page=1');
        const items = res.data?.result?.services;
        setServices(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Lỗi tải danh sách PT service:', error);
        setWarning('Không thể tải danh sách huấn luyện viên/gói PT.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchServices();
  }, []);

  const filteredServices = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return services;

    return services.filter((service) => {
      const title = service.title?.toLowerCase() || '';
      const description = service.description?.toLowerCase() || '';
      return title.includes(keyword) || description.includes(keyword);
    });
  }, [searchQuery, services]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">Danh sách huấn luyện viên & gói tập</h1>
          <p className="text-gray-500">Dữ liệu được tải từ hệ thống dịch vụ PT hiện có.</p>
        </div>

        <div className="max-w-md">
          <Input
            placeholder="Tìm theo tên gói hoặc mô tả..."
            icon={<Search size={18} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {warning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {warning}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-20 text-center">
            <Loader2 className="animate-spin text-orange-500 mx-auto" size={36} />
            <p className="text-sm font-medium text-gray-500 mt-4">Đang tải danh sách...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredServices.length === 0 ? (
              <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm font-medium text-gray-500">
                Không có gói PT phù hợp.
              </div>
            ) : (
              filteredServices.map((service) => (
                <article key={service._id} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4">
                    <Dumbbell size={22} />
                  </div>
                  <h3 className="text-lg font-black text-gray-900">{service.title || 'Gói PT'}</h3>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-3">{service.description || 'Không có mô tả'}</p>
                  <div className="mt-5 space-y-1 text-sm font-semibold text-gray-600">
                    <p>Số buổi: {Number(service.sessions || 0)}</p>
                    <p>Thời hạn: {Number(service.durationDays || 0)} ngày</p>
                    <p>Giá: {Number(service.price || 0).toLocaleString('vi-VN')} đ</p>
                  </div>
                  {service.ptId ? (
                    <Link
                      to={`/pt/${service.ptId}`}
                      className="mt-4 inline-flex text-sm font-bold text-orange-600 hover:text-orange-700"
                    >
                      Xem hồ sơ PT & đánh giá
                    </Link>
                  ) : null}
                </article>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
