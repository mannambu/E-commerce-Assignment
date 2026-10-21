import { useEffect, useState, type FormEvent } from 'react';
import AdminPage, { actionClass, fieldClass, Notice, panelClass, useAdminResource } from '@/components/dashboard/AdminPage';
import { apiError } from '@/lib/admin';
import api from '@/services/api';
type CommerceRules = { kitchenCutoffTime: string; kitchenCutoffDaysBefore: number; cancellationPolicy: { description: string; refundBeforeCutoffPercent: number; refundAfterCutoffPercent: number; refundShippingFee: boolean; }; };
export default function AdminSettings() {
  const resource = useAdminResource<CommerceRules>('/admin/commerce-settings');
  const [time, setTime] = useState('');
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => { if (resource.data) { setTime(resource.data.kitchenCutoffTime); setDays(resource.data.kitchenCutoffDaysBefore); } }, [resource.data]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !resource.data) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.patch('/admin/commerce-settings', { kitchenCutoffTime: time, kitchenCutoffDaysBefore: days }); setSuccess('Đã cập nhật giờ chốt bếp cho các đơn mới.'); resource.reload(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return <AdminPage
    title="Cấu hình giờ chốt bếp"
    loading={resource.loading}
    error={resource.error}
    onReload={busy ? undefined : resource.reload}>

    {error && <Notice error>
      {error}
    </Notice>}
    {success && <Notice>
      {success}
    </Notice>}

    <section className={panelClass + ' space-y-5'}>
      <h2 className="text-xl font-black text-gray-900">Thời hạn chốt bếp</h2>
      <p className="text-sm text-gray-500">Giờ Việt Nam (Asia/Ho_Chi_Minh). Cấu hình mới chỉ áp dụng cho đơn đặt sau khi lưu; các đơn đã đặt giữ thời hạn chốt hiện có.</p>
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1 text-sm font-bold">Giờ chốt bếp<input type="time" required className={fieldClass} value={time} onChange={event => setTime(event.target.value)} /></label>
          <label className="space-y-1 text-sm font-bold">Ngày chốt<select className={fieldClass} value={days} onChange={event => setDays(Number(event.target.value))}>
            <option value={1}>Ngày trước ngày giao</option>
            <option value={0}>Trong ngày giao</option>
          </select></label>
        </div>
        <button className={actionClass} disabled={busy || resource.loading || !resource.data}>
          {busy ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </form>
    </section>

    {resource.data && <section className={panelClass + ' space-y-3'}>
      <h2 className="text-xl font-black text-gray-900">Chính sách hủy hiện hành</h2>
      <p className="text-sm text-gray-600">
        {resource.data.cancellationPolicy.description}
      </p>
      <p className="text-sm text-gray-500">Hoàn trước giờ chốt: {resource.data.cancellationPolicy.refundBeforeCutoffPercent}%. Sau giờ chốt: {resource.data.cancellationPolicy.refundAfterCutoffPercent}%. {resource.data.cancellationPolicy.refundShippingFee ? 'Bao gồm phí giao đã thu của ngày hủy.' : ''}</p>
      <p className="text-sm text-gray-500">Chính sách này chỉ xem; không thay đổi món sau khi đặt.</p>
    </section>}
  </AdminPage>;
}
