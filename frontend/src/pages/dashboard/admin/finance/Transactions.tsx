import { useState } from 'react';
import AdminPage, { fieldClass, Notice, panelClass, useAdminResource } from '@/components/dashboard/AdminPage';
import { dateTime, money } from '@/lib/admin';

type Transaction = { _id: string; kind: string; status: string; amount: number; orderId?: string; deliveryId?: string; method?: string; source: string; occurredAt: string; description?: string; };
const kindLabels: Record<string, string> = { Payment: 'Thu tiền', Refund: 'Hoàn tiền', Expense: 'Chi phí' };
const stateLabels: Record<string, string> = { Pending: 'Đang chờ', Succeeded: 'Thành công', Failed: 'Thất bại' };
const sourceLabels: Record<string, string> = { VerifiedIPN: 'Cổng thanh toán xác thực', CODCollection: 'Thu COD', Reconciliation: 'Đối soát' };
export default function Transactions({ expenses = false }: { expenses?: boolean; }) {
  const resource = useAdminResource<Transaction[]>('/workspace/transactions');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(expenses ? 'Expense' : '');
  const [status, setStatus] = useState('');
  const rows = (resource.data || []).filter(row => (!kind || row.kind === kind) && (!status || row.status === status) && [row._id, row.orderId, row.description].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <AdminPage title={expenses ? 'Giao dịch chi phí' : 'Sổ giao dịch'} {...resource} onReload={resource.reload}>

    <Notice>Hiển thị tối đa 100 giao dịch gần nhất. Khoản hoàn đang chờ chưa phải tiền đã hoàn. Đây là sổ giao dịch để giám sát, không phải báo cáo doanh thu hoặc lợi nhuận đầy đủ.</Notice>

    <section className={panelClass + ' space-y-5'}>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Tìm giao dịch"
          className={fieldClass + ' md:!w-80'}
          placeholder="Mã giao dịch, mã đơn, mô tả..."
          value={search}
          onChange={event => setSearch(event.target.value)} />
        <select
          aria-label="Loại giao dịch"
          className={fieldClass + ' md:!w-48'}
          value={kind}
          onChange={event => setKind(event.target.value)}>
          <option value="">Tất cả loại</option>
          {Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>
            {label}
          </option>)}
        </select>
        <select
          aria-label="Trạng thái giao dịch"
          className={fieldClass + ' md:!w-48'}
          value={status}
          onChange={event => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>
            {label}
          </option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="text-xs uppercase text-gray-400 border-b border-gray-100">
            <tr>
              {['Giao dịch / đơn', 'Loại', 'Số tiền', 'Trạng thái', 'Nguồn', 'Thời điểm'].map(label => <th key={label} className="p-4">
                {label}
              </th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(row => <tr key={row._id} className="hover:bg-gray-50/60">
              <td className="p-4 max-w-xs break-words">
                <p className="font-bold">
                  {row._id}
                </p>
                <p className="text-xs text-gray-500">Đơn: {row.orderId || '—'}</p>
                {row.deliveryId && <p className="text-xs text-gray-500">Ngày giao: {row.deliveryId}</p>}
                <p className="text-xs text-gray-500 mt-1">
                  {row.description}
                </p>
              </td>
              <td className="p-4">
                {kindLabels[row.kind] || row.kind}
              </td>
              <td className="p-4 font-black whitespace-nowrap">
                {money(row.amount)}
              </td>
              <td className="p-4">
                <span
                  className={'rounded-lg px-3 py-1 text-xs font-bold ' + (row.status === 'Succeeded' ? 'bg-green-50 text-green-700' : row.status === 'Failed' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600')}>
                  {stateLabels[row.status] || row.status}
                </span>
              </td>
              <td className="p-4">
                {sourceLabels[row.source] || row.source}
                <p className="text-xs text-gray-500">
                  {row.method}
                </p>
              </td>
              <td className="p-4 whitespace-nowrap">
                {dateTime(row.occurredAt)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {!resource.loading && !resource.error && rows.length === 0 && <p className="py-8 text-center text-gray-500">Không có giao dịch phù hợp.</p>}
    </section>
  </AdminPage>;
}
