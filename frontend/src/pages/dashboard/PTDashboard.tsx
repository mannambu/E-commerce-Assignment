import { useEffect, useMemo, useState } from 'react';
import { Loader2, Users, ClipboardList, Clock } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type PTService = {
  _id: string;
  ptId?: string | { toString: () => string };
  title: string;
  sessions: number;
  durationDays: number;
  price: number;
  isActive: boolean;
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
  registeredPTServices?: ClientRegistration[];
};

type PTUserProfile = {
  _id?: string;
  username?: string;
  email?: string;
};

export default function PTDashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [services, setServices] = useState<PTService[]>([]);
  const [clients, setClients] = useState<PTClient[]>([]);
  const [profile, setProfile] = useState<PTUserProfile | null>(null);
  const [serviceTitleFilter, setServiceTitleFilter] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setWarning(null);

        const [servicesRes, clientsRes, meRes] = await Promise.allSettled([
          api.get('/pt/services?limit=100&page=1'),
          api.get('/pt/clients'),
          api.get('/users/me')
        ]);

        const me = meRes.status === 'fulfilled' ? meRes.value.data?.result : null;
        const myId = me?._id ? String(me._id) : '';

        if (meRes.status === 'fulfilled') {
          setProfile(me || null);
        }

        if (servicesRes.status === 'fulfilled') {
          const items = servicesRes.value.data?.result?.services;
          const allServices = Array.isArray(items) ? items : [];
          const ownServices = allServices.filter((service: PTService) => {
            const ownerId = typeof service.ptId === 'string' ? service.ptId : service.ptId?.toString?.();
            return ownerId && myId ? ownerId === myId : false;
          });
          setServices(ownServices);
        }

        if (clientsRes.status === 'fulfilled') {
          const items = clientsRes.value.data?.result;
          setClients(Array.isArray(items) ? items : []);
        } else {
          setWarning('Không tải được danh sách học viên từ hệ thống.');
        }

      } catch (error) {
        console.error('Lỗi khi tải PT dashboard:', error);
        setWarning('Có lỗi xảy ra khi tải dữ liệu dashboard PT.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const serviceMap = useMemo(() => {
    const map = new Map<string, PTService>();
    for (const service of services) {
      map.set(service._id, service);
    }
    return map;
  }, [services]);

  const clientRows = useMemo(() => {
    const rows: Array<{
      key: string;
      clientName: string;
      clientContact: string;
      serviceTitle: string;
      remaining: number;
      total: number;
      registeredAt: string;
    }> = [];

    for (const client of clients) {
      const registrations = Array.isArray(client.registeredPTServices) ? client.registeredPTServices : [];

      for (const reg of registrations) {
        if (!reg?.serviceId || !serviceMap.has(reg.serviceId)) continue;

        const service = serviceMap.get(reg.serviceId);
        rows.push({
          key: `${client._id}-${reg.serviceId}`,
          clientName: client.username || 'Khách hàng',
          clientContact: client.email || client.phone || 'N/A',
          serviceTitle: service?.title || 'Gói PT',
          remaining: Number(reg.remainingSessions || 0),
          total: Number(reg.totalSessions || 0),
          registeredAt: reg.registeredAt ? new Date(reg.registeredAt).toLocaleDateString('vi-VN') : 'N/A'
        });
      }
    }

    return rows.sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [clients, serviceMap]);

  const kpis = useMemo(() => {
    const activeRows = clientRows.filter((row) => row.remaining > 0).length;
    return {
      totalServices: services.length,
      totalClients: clients.length,
      activeEnrollments: activeRows
    };
  }, [clientRows, clients.length, services.length]);

  const filteredServices = useMemo(() => {
    const query = serviceTitleFilter.trim().toLowerCase();
    if (!query) return services;
    return services.filter((service) => (service.title || '').toLowerCase().includes(query));
  }, [serviceTitleFilter, services]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Dashboard PT"
          userName={profile?.username || 'Huấn luyện viên'}
          userRole="Huấn luyện viên"
          hideSearch={true}
        />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gói dịch vụ</p>
                  <p className="text-2xl font-black text-gray-900">{kpis.totalServices}</p>
                </div>
              </div>
            </article>

            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Học viên</p>
                  <p className="text-2xl font-black text-gray-900">{kpis.totalClients}</p>
                </div>
              </div>
            </article>

            <article className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Đăng ký còn buổi</p>
                  <p className="text-2xl font-black text-gray-900">{kpis.activeEnrollments}</p>
                </div>
              </div>
            </article>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <h2 className="text-xl font-black text-gray-900">Danh sách gói PT của bạn</h2>
              <input
                value={serviceTitleFilter}
                onChange={(e) => setServiceTitleFilter(e.target.value)}
                placeholder="Lọc theo title gói PT..."
                className="w-full md:w-72 h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredServices.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-medium text-gray-500">
                  Chưa có gói PT nào khớp điều kiện lọc.
                </div>
              ) : (
                filteredServices.map((service) => (
                  <article key={service._id} className="rounded-2xl border border-gray-100 p-5 bg-gray-50/70">
                    <p className="text-sm font-black text-gray-900">{service.title}</p>
                    <div className="mt-3 space-y-1 text-xs font-semibold text-gray-500">
                      <p>Số buổi: {service.sessions}</p>
                      <p>Thời hạn: {service.durationDays} ngày</p>
                      <p>Giá: {Math.round(service.price || 0).toLocaleString('vi-VN')} đ</p>
                      <p>Trạng thái: {service.isActive ? 'Đang mở bán' : 'Đã ẩn'}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
            <h2 className="text-xl font-black text-gray-900">Học viên đăng ký gói PT của bạn</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="pb-4">Học viên</th>
                    <th className="pb-4">Liên hệ</th>
                    <th className="pb-4">Gói PT</th>
                    <th className="pb-4">Buổi còn lại</th>
                    <th className="pb-4">Đăng ký</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm font-medium text-gray-500">
                        Chưa có học viên nào đăng ký gói của bạn.
                      </td>
                    </tr>
                  ) : (
                    clientRows.map((row) => (
                      <tr key={row.key} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-4 text-sm font-bold text-gray-900">{row.clientName}</td>
                        <td className="py-4 text-sm text-gray-500">{row.clientContact}</td>
                        <td className="py-4 text-sm font-semibold text-gray-700">{row.serviceTitle}</td>
                        <td className="py-4 text-sm font-black text-gray-900">{row.remaining}/{row.total}</td>
                        <td className="py-4 text-sm text-gray-500">{row.registeredAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
