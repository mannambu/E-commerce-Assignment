import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Utensils, Truck, RefreshCw, LogOut, MapPin, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useAdminResource } from '@/components/dashboard/AdminPage';
import { apiError, localDate, money, statusLabels } from '@/lib/admin';
import { getVietnamLocalDate } from '@/lib/date';
import { staffActions, staffUpdate, type StaffRole, type StaffStatus, type StaffTask } from '@/lib/staff-workspace';
import api from '@/services/api';

const labels: Record<StaffStatus, string> = { Cooking: 'Bắt đầu nấu', Ready: 'Hoàn tất chế biến', Delivering: 'Nhận hàng và xuất phát', Completed: 'Giao thành công', Failed: 'Giao thất bại' };
const meals: Record<string, string> = { Breakfast: 'Sáng', Lunch: 'Trưa', Dinner: 'Tối', Snack: 'Bữa phụ' };
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';
const emptyForm = { amount: '', reason: '', evidence: '' };

export default function StaffWorkspace({ role }: { role: StaffRole }) {
  const kitchen = role === 'Kitchen Staff';
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const resource = useAdminResource<StaffTask[]>(user?.role === role ? '/workspace/orders' : null);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [action, setAction] = useState<{ task: StaffTask; status: StaffStatus } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const locked = busy || uploading;
  const Icon = kitchen ? Utensils : Truck;
  const accent = kitchen ? 'bg-orange-600' : 'bg-blue-600';
  const textAccent = kitchen ? 'text-orange-600' : 'text-blue-600';
  const reload = () => { setAction(null); setError(''); setSuccess(''); resource.reload(); };
  const choose = (task: StaffTask, next: StaffStatus) => { setAction({ task, status: next }); setForm(emptyForm); setError(''); setSuccess(''); };
  const handleLogout = async () => {
    setBusy(true);
    try { await logout(); navigate('/login', { replace: true }); }
    catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action || locked || user?.role !== role) return;
    setError(''); setSuccess(''); setBusy(true);
    try {
      const request = staffUpdate(role, action.task, action.status, form);
      const response = await api.patch(request.path, request.body);
      const difference = response.data?.result?.deliveryResult?.codDifference;
      setSuccess(`${labels[action.status]}: đã ghi nhận cho đơn ${action.task.orderCode}, ngày ${localDate(action.task.date)}.${typeof difference === 'number' && difference !== 0 ? ` Chênh lệch COD: ${money(difference)}. Quản lý sẽ đối soát.` : ''}`);
      setAction(null); resource.reload();
    } catch (err) {
      setError(apiError(err));
      if ([403, 409].includes((err as { response?: { status?: number } }).response?.status || 0)) {
        setAction(null); resource.reload();
      }
    } finally { setBusy(false); }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || locked) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setError('Chọn ảnh không quá 5 MB.'); return; }
    if (form.evidence.split('\n').filter(value => value.trim()).length >= 10) { setError('Tối đa 10 ảnh minh chứng.'); return; }
    setUploading(true); setError('');
    try {
      const body = new FormData(); body.append('image', file);
      const response = await api.post('/medias/upload-image', body);
      const url = response.data?.result?.[0];
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Không nhận được URL ảnh hợp lệ.');
      setForm(previous => ({ ...previous, evidence: [previous.evidence.trim(), url].filter(Boolean).join('\n') }));
    } catch (err) { setError(apiError(err)); }
    finally { setUploading(false); }
  };
  const rows = (resource.data || []).filter(task => (!date || task.date === date) && (!status || task.status === status) &&
    [task.orderCode, task.orderId, ...task.items.map(item => item.name)].some(value => value.toLowerCase().includes(search.trim().toLowerCase())));

  return <div className="min-h-screen bg-slate-50 flex flex-col">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${accent} rounded-xl flex items-center justify-center text-white shadow-md`}><Icon size={22} /></div>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">{kitchen ? 'Khu vực chế biến Bếp (WF-24B)' : 'Khu vực Giao hàng (WF-24C)'}</h1>
          <p className="text-xs text-slate-500">{kitchen ? 'Danh sách suất ăn được phân công chuẩn bị và nấu' : 'Lịch trình các đơn được phân công giao và thu hộ COD'}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block"><p className="text-sm font-bold text-slate-900">{user?.username}</p><p className={`text-xs font-semibold uppercase ${textAccent}`}>{role}</p></div>
        <Button variant="outline" size="sm" disabled={locked || resource.loading} onClick={reload}><RefreshCw size={16} className={`mr-1 ${resource.loading ? 'animate-spin' : ''}`} />Làm mới</Button>
        <Button variant="ghost" size="sm" disabled={locked} onClick={handleLogout} className="text-red-600 hover:bg-red-50"><LogOut size={16} className="mr-1" />Đăng xuất</Button>
      </div>
    </header>
    <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
      {(error || resource.error) && <p role="alert" className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200">{error || resource.error}</p>}
      {success && <p role="status" className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200">{success}</p>}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input aria-label="Tìm đơn hoặc món ăn" placeholder="Mã đơn hoặc tên món..." value={search} disabled={locked} onChange={event => { setSearch(event.target.value); setAction(null); }} className={field + ' sm:w-64'} />
          <input type="date" aria-label="Ngày giao" value={date} disabled={locked} onChange={event => { setDate(event.target.value); setAction(null); }} className={field + ' sm:w-44'} />
          <select aria-label="Trạng thái" value={status} disabled={locked} onChange={event => { setStatus(event.target.value); setAction(null); }} className={field + ' sm:w-48'}>
            <option value="">Tất cả trạng thái</option>
            {(kitchen ? ['Confirmed', 'Cooking'] : ['Ready', 'Delivering', 'Failed']).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-500">{rows.length} suất giao phù hợp. Dữ liệu từ tối đa 100 đơn gần nhất được phân công; ngày giao tính theo giờ Việt Nam.</p>
      </div>
      {resource.loading ? <div role="status" className="py-20 text-center text-slate-400"><RefreshCw className={`animate-spin mx-auto mb-2 ${textAccent}`} size={32} />Đang tải công việc...</div>
        : !resource.error && rows.length === 0 ? <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-sm"><Icon className="mx-auto text-slate-300 mb-3" size={48} /><h2 className="font-bold text-slate-800">Không có công việc phù hợp</h2><p className="text-sm text-slate-500 mt-2">Kiểm tra bộ lọc hoặc chờ quản lý phân công.</p></div>
        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map(task => <section key={`${task.orderId}/${task.deliveryId}`} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex justify-between gap-2"><h2 className="font-bold text-slate-800 break-all">{task.orderCode}</h2><span className={`text-xs font-bold ${textAccent}`}>{statusLabels[task.status] || task.status}</span></div>
            <p className="text-sm font-bold">{localDate(task.date)} · {task.packageType === 'WEEKLY_7D' ? 'Gói tuần' : 'Đơn ngày'}</p>
            <ul className="divide-y divide-slate-100 text-sm">{task.items.map((item, index) => <li key={index} className="py-2 flex justify-between gap-2"><span>{item.name}<small className="block text-slate-500">{meals[item.mealSlot || ''] || item.mealSlot || 'Chưa ghi bữa'}</small></span><strong>×{item.quantity}</strong></li>)}</ul>
            {!kitchen && <>
              <p className="flex gap-2 text-sm text-slate-700"><MapPin size={18} className="shrink-0 text-blue-500" />{task.deliveryAddress || 'Chưa có địa chỉ'}</p>
              <p className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-bold">{task.paymentMethod === 'COD' ? `COD cần thu: ${money(task.codExpectedAmount)}` : 'Thanh toán online · Không thu COD'}</p>
              {task.status === 'Failed' && <div className="text-sm text-red-700 space-y-2"><p>Lý do: {task.deliveryResult?.reason || 'Chưa có lý do'}</p><p>Chờ quản lý xử lý; không tự giao lại.</p><div className="flex flex-wrap gap-2">{task.deliveryResult?.evidenceUrls?.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Minh chứng giao thất bại" className="h-16 w-16 object-cover rounded-lg" /></a>)}</div></div>}
            </>}
            {task.date > getVietnamLocalDate() && <p className="text-xs text-slate-500">Chưa tới ngày giao, chưa thể thao tác.</p>}
            <div className="flex flex-wrap gap-2">{staffActions(role, task).map(next => <Button key={next} size="sm" variant="outline" disabled={locked} onClick={() => choose(task, next)} className={next === 'Failed' ? 'text-red-600' : textAccent}>{labels[next]}</Button>)}</div>
            {action?.task.deliveryId === task.deliveryId && action.task.orderId === task.orderId && <form onSubmit={submit} className="border-t border-slate-200 pt-4 space-y-3">
              <h3 className="font-bold text-sm">Xác nhận: {labels[action.status]}</h3>
              {action.status === 'Completed' && task.paymentMethod === 'COD' && <label className="block text-sm space-y-2">Số tiền thực thu (VND)<input required type="number" min={0} step={1} value={form.amount} disabled={locked} onChange={event => setForm({ ...form, amount: event.target.value })} className={field} /><span className="block text-xs text-slate-500">Nhập đúng số đã thu, kể cả 0. Thu thiếu/thừa sẽ chuyển quản lý đối soát.</span></label>}
              {action.status === 'Failed' && <>
                <label className="block text-sm space-y-2">Lý do thất bại<textarea required maxLength={500} rows={3} value={form.reason} disabled={locked} onChange={event => setForm({ ...form, reason: event.target.value })} className={field} /></label>
                <label className="block text-sm space-y-2">Ảnh minh chứng (tùy chọn, mỗi dòng một URL HTTPS)<textarea rows={2} value={form.evidence} disabled={locked} onChange={event => setForm({ ...form, evidence: event.target.value })} className={field} /></label>
                <label className="block text-xs text-slate-600"><Upload size={14} className="inline mr-1" />{uploading ? 'Đang tải ảnh...' : 'Tải ảnh, tối đa 5 MB/ảnh và 10 ảnh'}<input type="file" accept="image/*" disabled={locked} onChange={upload} className="block w-full mt-2" /></label>
              </>}
              <p className="text-xs text-slate-500">Kiểm tra trước khi xác nhận. Kết quả đã chốt cần quản lý xử lý nếu có sai sót.</p>
              <div className="flex gap-2"><button disabled={locked} className={`${accent} text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50`}>{busy ? 'Đang lưu...' : 'Xác nhận'}</button><Button type="button" variant="ghost" disabled={locked} onClick={() => setAction(null)}>Bỏ qua</Button></div>
            </form>}
          </section>)}
        </div>}
    </main>
  </div>;
}
