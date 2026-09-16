import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Lock, Search, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import api from '@/services/api';

type UserRole = 'Customer' | 'PT' | 'Admin';
type AccountStatus = 'Active' | 'Pending' | 'Locked';

type AdminUser = {
  _id: string;
  username?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  account_status: AccountStatus;
  ptProfile?: {
    specialties?: string[];
    approvedByAdmin?: boolean;
    experienceYears?: number;
    rating?: number;
  } | null;
  created_at?: string;
};

type PTService = {
  _id: string;
  ptId?: string;
  title?: string;
  sessions?: number;
  durationDays?: number;
  price?: number;
  isActive?: boolean;
};

type PTReview = {
  _id: string;
  reviewerId?: string;
  rating?: number;
  comment?: string;
  createdAt?: string;
};

export default function AdminPT() {
  const [isLoading, setIsLoading] = useState(true);
  const [isActingUserId, setIsActingUserId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedPTId, setSelectedPTId] = useState<string | null>(null);
  const [selectedPTServices, setSelectedPTServices] = useState<PTService[]>([]);
  const [selectedPTReviews, setSelectedPTReviews] = useState<PTReview[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isActingServiceId, setIsActingServiceId] = useState<string | null>(null);
  const [isDeletingReviewId, setIsDeletingReviewId] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setWarning(null);
      const res = await api.get('/users');
      const data = Array.isArray(res.data?.result) ? res.data.result : [];
      setUsers(data);
    } catch (error: any) {
      console.error('Loi tai danh sach user admin:', error);
      setWarning(error?.response?.data?.message || 'Khong the tai danh sach nguoi dung.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((user) => {
      const specialties = (user.ptProfile?.specialties || []).join(' ').toLowerCase();
      return (
        (user.username || '').toLowerCase().includes(query) ||
        (user.email || '').toLowerCase().includes(query) ||
        (user.phone || '').toLowerCase().includes(query) ||
        specialties.includes(query)
      );
    });
  }, [users, searchQuery]);

  const ptUsers = useMemo(() => filteredUsers.filter((user) => user.role === 'PT'), [filteredUsers]);
  const allPTUsers = useMemo(() => users.filter((user) => user.role === 'PT'), [users]);

  useEffect(() => {
    if (allPTUsers.length === 0) return;

    const selectedStillExists = selectedPTId
      ? allPTUsers.some((user) => user._id === selectedPTId)
      : false;

    if (!selectedPTId || !selectedStillExists) {
      loadPTDetailPanel(allPTUsers[0]._id);
    }
  }, [allPTUsers, selectedPTId]);

  const handleApprovePT = async (userId: string) => {
    try {
      setIsActingUserId(userId);
      setWarning(null);
      await api.patch(`/users/${userId}/approve-pt`);
      await fetchUsers();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the duyet PT nay.');
    } finally {
      setIsActingUserId(null);
    }
  };

  const handleToggleLock = async (userId: string, currentStatus: AccountStatus) => {
    try {
      setIsActingUserId(userId);
      setWarning(null);

      const nextStatus: AccountStatus = currentStatus === 'Locked' ? 'Active' : 'Locked';
      await api.patch(`/users/${userId}/status`, { status: nextStatus });

      await fetchUsers();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the cap nhat trang thai tai khoan.');
    } finally {
      setIsActingUserId(null);
    }
  };

  const loadPTDetailPanel = async (ptId: string) => {
    try {
      setIsLoadingDetail(true);
      setWarning(null);

      const [servicesRes, reviewsRes] = await Promise.all([
        api.get('/pt/services?limit=300&page=1'),
        api.get(`/reviews/PT/${ptId}`)
      ]);

      const services = Array.isArray(servicesRes.data?.result?.services) ? servicesRes.data.result.services : [];
      const ownServices = services.filter((service: PTService) => String(service.ptId || '') === ptId);

      setSelectedPTId(ptId);
      setSelectedPTServices(ownServices);
      setSelectedPTReviews(Array.isArray(reviewsRes.data?.result) ? reviewsRes.data.result : []);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the tai thong tin goi/review cua PT.');
      setSelectedPTId(ptId);
      setSelectedPTServices([]);
      setSelectedPTReviews([]);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleHidePTService = async (serviceId: string) => {
    if (!selectedPTId) return;
    try {
      setIsActingServiceId(serviceId);
      setWarning(null);
      await api.delete(`/pt/services/${serviceId}`);
      await loadPTDetailPanel(selectedPTId);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the an goi PT.');
    } finally {
      setIsActingServiceId(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!selectedPTId) return;
    try {
      setIsDeletingReviewId(reviewId);
      setWarning(null);
      await api.delete(`/reviews/${reviewId}`);
      await loadPTDetailPanel(selectedPTId);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the xoa review.');
    } finally {
      setIsDeletingReviewId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen role-page-shell">
        <Sidebar role="admin" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen role-page-shell">
      <Sidebar role="admin" />
      <div className="flex-1 flex flex-col min-w-0">
        <Header title="Quản lý PT" userRole="Quản trị viên" hideSearch={true} />

        <main className="p-8 space-y-6 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative group w-full md:w-[26rem]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input
                type="text"
                placeholder="Tìm theo tên, email, số điện thoại, chuyên môn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-6 h-12 bg-white border border-gray-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
              />
            </div>
            <div className="ml-auto rounded-xl bg-white border border-gray-100 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
              Tổng PT: {ptUsers.length}
            </div>
          </div>

          <section className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Quản lý gói tập và review theo PT</p>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <label className="text-sm font-semibold text-gray-700">Chọn PT:</label>
              <select
                value={selectedPTId || ''}
                onChange={(e) => loadPTDetailPanel(e.target.value)}
                className="h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-600/10"
              >
                {allPTUsers.map((pt) => (
                  <option key={pt._id} value={pt._id}>
                    {(pt.username || 'PT')} - {pt.email || 'N/A'}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <div className="bg-white rounded-[28px] shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full min-w-[900px] text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/40">
                  <th className="px-6 py-4">PT</th>
                  <th className="px-6 py-4">Liên hệ</th>
                  <th className="px-6 py-4">Chuyên môn</th>
                  <th className="px-6 py-4">Trạng thái</th>
                  <th className="px-6 py-4">Duyệt Admin</th>
                  <th className="px-6 py-4">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ptUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 font-medium">
                      Không có tài khoản PT phù hợp.
                    </td>
                  </tr>
                ) : (
                  ptUsers.map((user) => {
                    const isPending = user.account_status === 'Pending';
                    const isLocked = user.account_status === 'Locked';
                    const isApproved = Boolean(user.ptProfile?.approvedByAdmin);
                    const isActing = isActingUserId === user._id;

                    return (
                      <tr key={user._id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-gray-900">{user.username || 'N/A'}</p>
                          <p className="text-[11px] text-gray-400">ID: {user._id.slice(-8)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-700">{user.email || 'N/A'}</p>
                          <p className="text-xs text-gray-500">{user.phone || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {(user.ptProfile?.specialties || []).join(', ') || 'Chua cap nhat'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                              user.account_status === 'Active'
                                ? 'bg-green-100 text-green-600'
                                : user.account_status === 'Pending'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-600'
                            }`}
                          >
                            {user.account_status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider ${
                              isApproved ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {isApproved ? <ShieldCheck size={12} /> : <ShieldX size={12} />}
                            {isApproved ? 'Da duyet' : 'Chua duyet'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              disabled={!isPending || isActing}
                              onClick={() => handleApprovePT(user._id)}
                              className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-green-600 text-white text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <CheckCircle2 size={14} />
                              Duyet
                            </button>
                            <button
                              type="button"
                              disabled={isPending || isActing}
                              onClick={() => handleToggleLock(user._id, user.account_status)}
                              className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 text-xs font-black disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Lock size={14} />
                              {isLocked ? 'Mo khoa' : 'Khoa'}
                            </button>
                            <button
                              type="button"
                              onClick={() => loadPTDetailPanel(user._id)}
                              className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-blue-200 text-blue-600 text-xs font-black"
                            >
                              <Eye size={14} />
                              Gói & Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {selectedPTId ? (
            <section className="space-y-4">
              <h3 className="text-lg font-black text-gray-900">Bảng điều khiển gói PT và review</h3>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <section className="bg-white rounded-[28px] shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-gray-900">Quản lý gói PT</h3>
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">PT: {selectedPTId.slice(-8)}</span>
                </div>

                {isLoadingDetail ? (
                  <div className="py-8 text-center text-sm text-gray-500">Đang tải dữ liệu...</div>
                ) : selectedPTServices.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">PT này chưa có gói nào.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedPTServices.map((service) => (
                      <article key={service._id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-900">{service.title || 'Gói PT'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {Number(service.sessions || 0)} buổi • {Number(service.durationDays || 0)} ngày • {Math.round(Number(service.price || 0)).toLocaleString('vi-VN')} vnd
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isActingServiceId === service._id}
                            onClick={() => handleHidePTService(service._id)}
                            className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 text-xs font-black disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            {isActingServiceId === service._id ? 'Đang ẩn...' : 'Ẩn gói'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="bg-white rounded-[28px] shadow-sm border border-gray-100 p-6 space-y-4">
                <h3 className="text-lg font-black text-gray-900">Quản lý review PT</h3>

                {isLoadingDetail ? (
                  <div className="py-8 text-center text-sm text-gray-500">Đang tải dữ liệu...</div>
                ) : selectedPTReviews.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">PT này chưa có review nào.</div>
                ) : (
                  <div className="space-y-3">
                    {selectedPTReviews.map((review) => (
                      <article key={review._id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-gray-900">{Number(review.rating || 0).toFixed(1)} / 5</p>
                          <button
                            type="button"
                            disabled={isDeletingReviewId === review._id}
                            onClick={() => handleDeleteReview(review._id)}
                            className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 text-xs font-black disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            {isDeletingReviewId === review._id ? 'Đang xóa...' : 'Xóa review'}
                          </button>
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
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
