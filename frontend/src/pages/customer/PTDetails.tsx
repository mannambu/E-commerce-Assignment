import { useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { 
  ArrowLeft, 
  Star, 
  Award, 
  TrendingUp, 
  MessageCircle, 
  Users,
  Instagram,
  Facebook
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/layout/Navbar';
import api from '@/services/api';
import ReviewSection from '@/components/customer/ReviewSection';

type PTService = {
  _id: string;
  ptId: string;
  title?: string;
  description?: string;
  price?: number;
  sessions?: number;
  durationDays?: number;
};

export default function PTDetails() {
  const { id } = useParams();
  const [services, setServices] = useState<PTService[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setIsLoading(true);
        const res = await api.get('/pt/services?limit=200&page=1');
        const items = res.data?.result?.services;
        const all = Array.isArray(items) ? items : [];
        setServices(all.filter((service: PTService) => String(service.ptId) === String(id)));
      } catch (error) {
        console.error('Lỗi tải chi tiết PT:', error);
        setServices([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) {
      fetchServices();
    }
  }, [id]);

  const displayName = useMemo(() => {
    if (services.length === 0) return 'Huấn luyện viên';
    const title = services[0].title || '';
    return `PT - ${title}`;
  }, [services]);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/pt-directory" className="inline-flex items-center text-gray-500 hover:text-orange-500 mb-8 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Quay lại danh sách PT
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Left: Profile Card */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[40px] overflow-hidden shadow-2xl border border-gray-100"
            >
              <div className="aspect-[3/4] relative">
                <img 
                  src={`https://picsum.photos/seed/pt-${id || 'demo'}/600/800`} 
                  alt={displayName} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl shadow-xl">
                  <h1 className="text-2xl font-black text-gray-900">{displayName}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <Star size={16} className="text-yellow-500 fill-yellow-500" />
                    <span className="font-bold text-gray-900">Đánh giá từ người dùng</span>
                  </div>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="flex justify-center gap-4">
                  <button className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors">
                    <Facebook size={24} />
                  </button>
                  <button className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-100 transition-colors">
                    <Instagram size={24} />
                  </button>
                  <button className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors">
                    <MessageCircle size={24} />
                  </button>
                </div>
                <Button className="w-full h-14 rounded-2xl text-lg shadow-lg shadow-orange-200">
                  Đăng ký tư vấn ngay
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Right: Details */}
          <div className="lg:col-span-2 space-y-12">
            <div className="space-y-6">
              <h2 className="text-3xl font-black text-gray-900">Giới thiệu bản thân</h2>
              <p className="text-lg text-gray-500 leading-relaxed italic">
                "PT sẽ đồng hành theo các gói tập đang mở bán. Bạn có thể tham khảo dịch vụ và đọc đánh giá thực tế ngay bên dưới."
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 space-y-3">
                  <h3 className="font-bold text-orange-900 flex items-center gap-2">
                    <Award size={20} /> Kinh nghiệm & Chuyên môn
                  </h3>
                  <p className="text-sm text-orange-800">Theo dõi, dinh dưỡng, cải thiện sức khỏe và thể lực bền vững.</p>
                </div>
                <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-3">
                  <h3 className="font-bold text-blue-900 flex items-center gap-2">
                    <Users size={20} /> Học viên đã hỗ trợ
                  </h3>
                  <p className="text-sm text-blue-800">Hơn 500+ khách hàng đã thay đổi thành công.</p>
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-gray-900">Các gói dịch vụ</h2>
              {isLoading ? (
                <p className="text-sm text-gray-500">Đang tải gói dịch vụ...</p>
              ) : services.length === 0 ? (
                <p className="text-sm text-gray-500">PT này hiện chưa có gói dịch vụ công khai.</p>
              ) : (
                <div className="space-y-4">
                {services.map((service, i) => (
                  <div 
                    key={service._id || i} 
                    className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group hover:border-orange-500 transition-all cursor-default"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                        <TrendingUp size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{service.title || 'Gói dịch vụ PT'}</h4>
                        <p className="text-xs text-gray-400 line-clamp-2">{service.description || 'Hỗ trợ theo lộ trình cá nhân hóa.'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-orange-500">{Number(service.price || 0).toLocaleString('vi-VN')}đ</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">/{Number(service.durationDays || 0)} ngày</p>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>

            <ReviewSection targetType="PT" targetId={id} title="Đánh giá huấn luyện viên" />
          </div>
        </div>
      </main>
    </div>
  );
}
