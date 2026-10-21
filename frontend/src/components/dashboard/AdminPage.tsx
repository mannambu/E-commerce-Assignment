import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, RefreshCw, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Header from './Header';
import api from '@/services/api';
import { apiError } from '@/lib/admin';

export const panelClass = 'bg-white rounded-[28px] border border-gray-100 shadow-sm p-6';
export const fieldClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm role-input-focus';
export const actionClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold bg-[#c1e06d] text-gray-900 hover:bg-[#b1d05d] disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';

export function useAdminResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    if (!url) { setLoading(false); return; }
    setLoading(true);
    api.get(url, { signal: controller.signal }).then(res => {
      if (!controller.signal.aborted) setData(res.data.result);
    }).catch(err => {
      if (!controller.signal.aborted) setError(apiError(err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [url, revision]);
  return { data, loading, error, reload: () => setRevision(value => value + 1) };
}

export default function AdminPage({ title, children, loading = false, error, onReload }: {
  title: string; children: ReactNode; loading?: boolean; error?: string; onReload?: () => void;
}) {
  return <div className="flex min-h-screen role-page-shell">

    <Sidebar role="admin" />

    <div className="flex-1 flex flex-col min-w-0">

      <Header title={title} userRole="Quản trị viên" hideSearch />

      <main className="p-8 space-y-6 min-w-0">

        {onReload && <div className="flex justify-end">
          <button className={secondaryClass} onClick={onReload} disabled={loading}><RefreshCw size={16} />Tải lại</button>
        </div>}

        {error && <Notice error>
          {error}
        </Notice>}

        {loading && <div role="status" className="flex items-center gap-3 text-sm text-gray-500"><Loader2 className="animate-spin text-orange-500" size={22} />Đang tải dữ liệu...</div>}

        {children}
      </main>
    </div>
  </div>;
}
export function Notice({ error = false, children }: { error?: boolean; children: ReactNode; }) {
  return <div
    role={error ? 'alert' : 'status'}
    className={`rounded-2xl border px-4 py-3 text-sm ${error ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-teal-100 bg-teal-50 text-teal-800'}`}>
    {children}
  </div>;
}
export function AdminModal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog
    ref={ref}
    aria-label={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto w-[min(94vw,960px)] max-h-[90vh] overflow-y-auto rounded-[32px] p-0 border border-gray-100 bg-white shadow-2xl backdrop:bg-black/40">

    <div className="flex items-center justify-between gap-4 p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
      <h2 className="text-xl font-black text-gray-900">
        {title}
      </h2>
      <button aria-label="Đóng" disabled={busy} onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50">
        <X size={20} />
      </button>
    </div>

    <div className="p-6 space-y-5">
      {children}
    </div>
  </dialog>;
}
export function Pagination({ page, total, limit, onPage, busy = false }: { page: number; total: number; limit: number; onPage: (page: number) => void; busy?: boolean; }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="flex items-center justify-between gap-3 text-sm text-gray-500">
    <span>{total} kết quả · Trang {page}/{pages}</span>
    <div className="flex gap-2">
      <button className={secondaryClass} disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
      <button className={secondaryClass} disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Sau</button>
    </div>
  </div>;
}
