import { useState, type FormEvent } from 'react';
import { Plus, LockKeyhole, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminPage, { AdminModal, Notice, Pagination, actionClass, fieldClass, panelClass, secondaryClass, useAdminResource } from '@/components/dashboard/AdminPage';
import { roles, roleLabels, type AccountRole, apiError, dateTime, validatePassword } from '@/lib/admin';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

type Account = { _id: string; username: string; email: string; phone: string; role: AccountRole; account_status: 'Active' | 'Locked'; created_at: string; };
type UserList = { items: Account[]; total: number; page: number; limit: number; };
const emptyAccount = { email: '', username: '', phone: '', password: '', confirm_password: '', role: 'Manager' as AccountRole };

export default function AdminUsers() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), limit: '10', ...(query ? { search: query } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}) });
  const resource = useAdminResource<UserList>(`/users?${params}`);
  const [modal, setModal] = useState<'create' | 'status' | 'role' | null>(null);
  const [selected, setSelected] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyAccount);
  const [newRole, setNewRole] = useState<AccountRole>('Customer');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (kind: typeof modal, account?: Account) => {
    setModal(kind); setSelected(account || null); setNewRole(account?.role || 'Customer');
    setReason(''); setError(''); setForm(emptyAccount); setSuccess('');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    setError('');
    if (modal === 'create') {
      const passwordError = validatePassword(form.password, form.confirm_password);
      if (passwordError) { setError(passwordError); return; }
      if (![form.email, form.username, form.phone].every(value => value.trim())) { setError('Vui lòng nhập đầy đủ thông tin tài khoản.'); return; }
    } else if (!reason.trim()) { setError('Vui lòng nhập lý do thay đổi.'); return; }
    setBusy(true);
    try {
      if (modal === 'create') {
        await api.post('/users', { ...form, email: form.email.trim(), username: form.username.trim(), phone: form.phone.trim() });
      } else if (selected) {
        await api.patch(`/users/${selected._id}/${modal}`, modal === 'role'
          ? { role: newRole, reason: reason.trim() }
          : { status: selected.account_status === 'Active' ? 'Locked' : 'Active', reason: reason.trim() });
        if (selected._id === user?._id && (modal === 'status' || newRole !== selected.role)) {
          logout(); navigate('/login', { replace: true }); return;
        }
      }
      setModal(null); setSuccess(modal === 'create' ? 'Đã tạo tài khoản nội bộ.' : 'Đã cập nhật tài khoản. Các phiên cũ của tài khoản bị thay đổi đã được thu hồi.');
      resource.reload();
    } catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return <AdminPage title="Quản lý người dùng" {...resource} onReload={resource.reload}>

    {success && <Notice>
      {success}
    </Notice>}

    <section className={panelClass + ' space-y-5'}>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900">Tài khoản hệ thống</h2>
          <p className="text-sm text-gray-500 mt-1">Quản lý quyền truy cập của khách hàng và nhân viên.</p>
        </div>
        <button className={actionClass} onClick={() => open('create')}><Plus size={18} />Tạo tài khoản nội bộ</button>
      </div>

      <form onSubmit={event => { event.preventDefault(); setPage(1); setQuery(search.trim()); }} className="flex flex-wrap gap-3">

        <input
          aria-label="Tìm người dùng"
          maxLength={100}
          placeholder="Tên hoặc email..."
          className={fieldClass + ' md:!w-72'}
          value={search}
          onChange={event => setSearch(event.target.value)} />

        <select
          aria-label="Vai trò"
          className={fieldClass + ' md:!w-52'}
          value={role}
          onChange={event => { setRole(event.target.value); setPage(1); }}>
          <option value="">Tất cả vai trò</option>
          {roles.map(value => <option key={value} value={value}>
            {roleLabels[value]}
          </option>)}
        </select>

        <select
          aria-label="Trạng thái tài khoản"
          className={fieldClass + ' md:!w-48'}
          value={status}
          onChange={event => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="Active">Hoạt động</option>
          <option value="Locked">Đã khóa</option>
        </select>
        <button className={secondaryClass}>Tìm kiếm</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="text-xs uppercase text-gray-400 border-b border-gray-100">
            <tr>
              {['Người dùng', 'Vai trò', 'Trạng thái', 'Ngày tạo', 'Thao tác'].map(label => <th key={label} className="p-4">
                {label}
              </th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {resource.data?.items.map(account => <tr key={account._id} className="hover:bg-gray-50/60">
              <td className="p-4">
                <p className="font-bold text-gray-900">
                  {account.username}
                  {account._id === user?._id ? ' (Bạn)' : ''}
                </p>
                <p className="text-gray-500">
                  {account.email}
                </p>
                <p className="text-xs text-gray-400">
                  {account.phone}
                </p>
              </td>
              <td className="p-4">
                {roleLabels[account.role]}
              </td>
              <td className="p-4">
                <span
                  className={`rounded-lg px-3 py-1 text-xs font-bold ${account.account_status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {account.account_status === 'Active' ? 'Hoạt động' : 'Đã khóa'}
                </span>
              </td>
              <td className="p-4">
                {dateTime(account.created_at)}
              </td>
              <td className="p-4">
                <div className="flex gap-2">
                  <button className={secondaryClass} onClick={() => open('status', account)}>
                    <LockKeyhole size={15} />
                    {account.account_status === 'Active' ? 'Khóa' : 'Mở khóa'}
                  </button>
                  <button className={secondaryClass} onClick={() => open('role', account)}><Shield size={15} />Đổi quyền</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {!resource.loading && !resource.error && resource.data?.items.length === 0 && <p className="py-8 text-center text-gray-500">Không tìm thấy người dùng.</p>}

      {resource.data && <Pagination page={page} total={resource.data.total} limit={10} onPage={setPage} busy={resource.loading} />}
    </section>

    {modal && <AdminModal
      title={modal === 'create' ? 'Tạo tài khoản nội bộ' : modal === 'role' ? 'Thay đổi quyền truy cập' : `${selected?.account_status === 'Active' ? 'Khóa' : 'Mở khóa'} tài khoản`}
      busy={busy}
      onClose={() => setModal(null)}>

      <form onSubmit={save} className="space-y-4">

        {error && <Notice error>
          {error}
        </Notice>}

        {modal === 'create' ? <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([['email', 'Email', 'email'], ['username', 'Tên đăng nhập', 'text'], ['phone', 'Số điện thoại', 'tel'], ['password', 'Mật khẩu', 'password'], ['confirm_password', 'Xác nhận mật khẩu', 'password']] as const).map(([key, label, type]) => <label key={key} className="space-y-1 text-sm font-bold text-gray-700">
              {label}
              <input
                required
                type={type}
                autoComplete={type === 'password' ? 'new-password' : 'off'}
                className={fieldClass}
                value={form[key]}
                onChange={event => setForm({ ...form, [key]: event.target.value })} />
            </label>)}
          </div>
          <label className="block space-y-1 text-sm font-bold">Vai trò<select
            className={fieldClass}
            value={form.role}
            onChange={event => setForm({ ...form, role: event.target.value as AccountRole })}>
            {roles.filter(value => value !== 'Customer').map(value => <option key={value} value={value}>
              {roleLabels[value]}
            </option>)}
          </select></label>
          <p className="text-sm text-gray-500">Tài khoản hoạt động ngay sau khi tạo. Khách hàng tự đăng ký tại trang công khai.</p>
        </> : <>
          <p className="text-sm font-bold">{selected?.username} · {selected?.email}</p>
          {modal === 'role' && <label className="block space-y-1 text-sm font-bold">Vai trò mới<select className={fieldClass} value={newRole} onChange={event => setNewRole(event.target.value as AccountRole)}>
            {roles.map(value => <option key={value} value={value}>
              {roleLabels[value]}
            </option>)}
          </select></label>}
          <label className="block space-y-1 text-sm font-bold">Lý do bắt buộc<textarea
            required
            maxLength={500}
            rows={3}
            className={fieldClass}
            value={reason}
            onChange={event => setReason(event.target.value)} /></label>
          <p className="text-sm text-gray-500">Thay đổi sẽ thu hồi các phiên đăng nhập cũ. Không thể khóa hoặc hạ quyền quản trị viên hoạt động cuối cùng.</p>
        </>}

        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryClass} disabled={busy} onClick={() => setModal(null)}>Hủy</button>
          <button className={actionClass} disabled={busy || (modal === 'role' && newRole === selected?.role)}>
            {busy ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </div>
      </form>
    </AdminModal>}
  </AdminPage>;
}
