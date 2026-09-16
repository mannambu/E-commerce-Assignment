import { useEffect, useMemo, useState } from 'react';
import { Loader2, UserCircle, ClipboardList, Clock3 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type PTService = {
  _id: string;
  ptId?: string;
  title?: string;
};

type ClientRegistration = {
  serviceId?: string;
  remainingSessions?: number;
  totalSessions?: number;
  registeredAt?: string;
};

type PTClient = {
  _id: string;
  username?: string;
  email?: string;
  phone?: string;
  registeredPTServices?: Array<ClientRegistration | string>;
};

type PTMe = {
  _id: string;
  username?: string;
  email?: string;
  phone?: string;
  ptProfile?: {
    experienceYears?: number;
    specialties?: string[];
    rating?: number;
    approvedByAdmin?: boolean;
  };
};

type PTReview = {
  _id: string;
  reviewerId?: string;
  rating?: number;
  comment?: string;
  createdAt?: string;
};

type ClientRow = {
  key: string;
  clientId: string;
  clientName: string;
  contact: string;
  serviceId: string;
  serviceTitle: string;
  remaining: number;
  total: number;
  registeredAt: string;
};

function parseRegistration(reg: ClientRegistration | string) {
  if (typeof reg === 'string') {
    return {
      serviceId: reg,
      remainingSessions: 0,
      totalSessions: 0,
      registeredAt: undefined
    };
  }

  return {
    serviceId: reg?.serviceId,
    remainingSessions: Number(reg?.remainingSessions || 0),
    totalSessions: Number(reg?.totalSessions || 0),
    registeredAt: reg?.registeredAt
  };
}

export default function PTProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingIn, setIsCheckingIn] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [me, setMe] = useState<PTMe | null>(null);
  const [services, setServices] = useState<PTService[]>([]);
  const [clients, setClients] = useState<PTClient[]>([]);
  const [reviews, setReviews] = useState<PTReview[]>([]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const meRes = await api.get('/users/me');

      const meResult = meRes.data?.result;
      const [servicesRes, clientsRes, reviewsRes] = await Promise.all([
        api.get('/pt/services?limit=100&page=1'),
        api.get('/pt/clients'),
        api.get(`/reviews/PT/${meResult?._id}`)
      ]);
      const allServices = Array.isArray(servicesRes.data?.result?.services) ? servicesRes.data.result.services : [];
      const ownServices = allServices.filter((service: any) => {
        const ownerId = typeof service?.ptId === 'string' ? service.ptId : service?.ptId?.toString?.();
        return ownerId && meResult?._id ? ownerId === meResult._id : false;
      });

      setMe(meResult || null);
      setServices(ownServices);
      setClients(Array.isArray(clientsRes.data?.result) ? clientsRes.data.result : []);
      setReviews(Array.isArray(reviewsRes.data?.result) ? reviewsRes.data.result : []);
    } catch (error) {
      console.error('Lỗi tải PT profile:', error);
      setWarning('Không thể tải dữ liệu. Vui lòng thử lại sau.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const serviceMap = useMemo(() => {
    const map = new Map<string, PTService>();
    for (const service of services) {
      map.set(service._id, service);
    }
    return map;
  }, [services]);

  const rows = useMemo(() => {
    const list: ClientRow[] = [];

    for (const client of clients) {
      const registrations = Array.isArray(client.registeredPTServices) ? client.registeredPTServices : [];

      for (const reg of registrations) {
        const parsed = parseRegistration(reg);
        if (!parsed.serviceId || !serviceMap.has(parsed.serviceId)) continue;

        const serviceTitle = serviceMap.get(parsed.serviceId)?.title || 'Gói PT';

        list.push({
          key: `${client._id}-${parsed.serviceId}`,
          clientId: client._id,
          clientName: client.username || 'Khách hàng ẩn danh',
          contact: client.email || client.phone || 'N/A',
          serviceId: parsed.serviceId,
          serviceTitle,
          remaining: parsed.remainingSessions,
          total: parsed.totalSessions,
          registeredAt: parsed.registeredAt ? new Date(parsed.registeredAt).toLocaleDateString('vi-VN') : 'N/A'
        });
      }
    }

    return list;
  }, [clients, serviceMap]);

  const handleCheckIn = async (row: ClientRow) => {
    try {
      setIsCheckingIn(row.key);
      setWarning(null);
      await api.patch(`/pt/clients/${row.clientId}/services/${row.serviceId}/check-in`);
      await fetchData();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Check-in thất bại.');
    } finally {
      setIsCheckingIn(null);
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

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="pt" />

      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Học viên & PT profile" userName={me?.username} userRole="Huấn luyện viên" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserCircle size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tài khoản PT</p>
                  <p className="text-sm font-black text-gray-900">{me?.email || 'N/A'}</p>
                </div>
              </div>
            </article>

            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gói PT của bạn</p>
                  <p className="text-2xl font-black text-gray-900">{services.length}</p>
                </div>
              </div>
            </article>

            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                  <Clock3 size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Lượt đăng ký</p>
                  <p className="text-2xl font-black text-gray-900">{rows.length}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <h2 className="text-xl font-black text-gray-900">Thông tin PT</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <p><span className="font-black">Họ tên:</span> {me?.username || 'N/A'}</p>
              <p><span className="font-black">Email:</span> {me?.email || 'N/A'}</p>
              <p><span className="font-black">Số điện thoại:</span> {me?.phone || 'N/A'}</p>
              <p><span className="font-black">Kinh nghiệm:</span> {Number(me?.ptProfile?.experienceYears || 0)} năm</p>
              <p><span className="font-black">Dánh gia:</span> {Number(me?.ptProfile?.rating || 0).toFixed(1)}</p>
              <p><span className="font-black">Trạng thái duyệt:</span> {me?.ptProfile?.approvedByAdmin ? 'Đã duyệt' : 'Chưa duyệt'}</p>
            </div>
            <p className="text-sm"><span className="font-black">Chuyên môn:</span> {(me?.ptProfile?.specialties || []).join(', ') || 'Chưa cập nhật'}</p>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <h2 className="text-xl font-black text-gray-900">Danh sách học viên và check-in</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-4">Học viên</th>
                    <th className="pb-4">Liên hệ</th>
                    <th className="pb-4">Gói PT</th>
                    <th className="pb-4">Còn lại</th>
                    <th className="pb-4">Đăng ký</th>
                    <th className="pb-4">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm font-medium text-gray-500">
                        Chưa có học viên đăng ký gói của bạn.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-4 text-sm font-bold text-gray-900">{row.clientName}</td>
                        <td className="py-4 text-sm text-gray-500">{row.contact}</td>
                        <td className="py-4 text-sm font-semibold text-gray-700">{row.serviceTitle}</td>
                        <td className="py-4 text-sm font-black text-gray-900">{row.remaining}/{row.total}</td>
                        <td className="py-4 text-sm text-gray-500">{row.registeredAt}</td>
                        <td className="py-4 text-sm">
                          <button
                            type="button"
                            disabled={row.remaining <= 0 || isCheckingIn === row.key}
                            onClick={() => handleCheckIn(row)}
                            className="px-3 h-9 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isCheckingIn === row.key ? 'Đang trừ buổi...' : 'Check-in'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">Review về PT của bạn</h2>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tổng: {reviews.length}</span>
            </div>

            {reviews.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có review nào.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <article key={review._id} className="rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-800">Người dùng {String(review.reviewerId || '').slice(-6)}</p>
                      <p className="text-sm font-black text-amber-600">{Number(review.rating || 0).toFixed(1)} / 5</p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{review.comment || 'Không có nội dung'}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {review.createdAt ? new Date(review.createdAt).toLocaleDateString('vi-VN') : ''}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
