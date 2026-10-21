import { useState, type FormEvent } from 'react';
import AdminPage, { AdminModal, Notice, actionClass, fieldClass, panelClass, secondaryClass, useAdminResource } from '@/components/dashboard/AdminPage';
import { type AdminOrder, type Delivery, type OrderStatus, orderStatuses, statusLabels, paymentLabels, nextDeliveryStatus, dateTime, localDate, money, apiError } from '@/lib/admin';
import api from '@/services/api';
import { cancellationPreviewError, weeklyStatusBlockReason, type CancellationPreview } from '@/lib/admin-orders';

type ExceptionAction = { kind: 'status' | 'cancel'; delivery?: Delivery; next?: OrderStatus; };

function OrderDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void; }) {
  const resource = useAdminResource<AdminOrder>('/orders/' + id);
  const order = resource.data;
  const [action, setAction] = useState<ExceptionAction | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useAdminResource<CancellationPreview>(action?.kind === 'cancel' && action.delivery ? '/orders/' + id + '/deliveries/' + action.delivery._id + '/cancellation' : null);
  const previewIssue = action?.kind === 'cancel' && action.delivery && order && preview.data
    ? cancellationPreviewError(order, action.delivery, preview.data) : null;
  const choose = (value: ExceptionAction) => { setAction(value); setReason(''); setError(''); setSuccess(''); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!action || !order || busy) return;
    if (reason.trim().length < 3 || reason.trim().length > 300) { setError('Nhập lý do can thiệp từ 3 đến 300 ký tự.'); return; }
    if (action.delivery) {
      const issue = action.kind === 'cancel'
        ? cancellationPreviewError(order, action.delivery, preview.data)
        : weeklyStatusBlockReason(order, action.delivery);
      if (issue) { setError(issue); return; }
    }
    setBusy(true); setError('');
    try {
      const path = '/orders/' + id + (action.delivery ? '/deliveries/' + action.delivery._id : '');
      if (action.kind === 'status') {
        await api.patch(path + '/status', { status: action.next, version: order.version, exceptionReason: reason.trim() });
      } else {
        const body = { reason: reason.trim(), exceptionReason: reason.trim(), version: action.delivery ? preview.data!.version : order.version };
        if (action.delivery) await api.post(path + '/cancel', body);
        else await api.patch(path + '/cancel', body);
      }
      setAction(null); setSuccess('Đã cập nhật đơn hàng. Khoản hoàn (nếu có) cần tiếp tục được xử lý, chưa đồng nghĩa đã hoàn tiền.');
      resource.reload(); onChanged();
    } catch (err) {
      setError(apiError(err));
      if ((err as { response?: { status?: number; }; }).response?.status === 409) {
        setAction(null); resource.reload(); onChanged();
        setError(apiError(err) + ' Dữ liệu đang được tải lại; hãy kiểm tra trước khi chọn lại thao tác.');
      }
    } finally { setBusy(false); }
  };
  const terminal = order && ['Completed', 'Cancelled', 'Rejected'].includes(order.status);
  return <AdminModal title={order ? 'Chi tiết đơn ' + (order.orderCode || order._id) : 'Chi tiết đơn hàng'} busy={busy} onClose={onClose}>

    {(resource.error || error) && <Notice error>
      {error || resource.error}
    </Notice>}
    {success && <Notice>
      {success}
    </Notice>}

    {resource.loading && <p role="status" className="text-sm text-gray-500">Đang tải đơn hàng...</p>}

    <button className={secondaryClass} disabled={busy || resource.loading} onClick={() => { setAction(null); resource.reload(); }}>Tải lại chi tiết</button>

    {order && <>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">

        <p>Khách hàng: <strong>
          {order.userId}
        </strong></p>
        <p>Trạng thái: <strong>
          {statusLabels[order.status] || order.status}
        </strong></p>

        <p>Thanh toán: <strong>{order.payment.method} · {paymentLabels[order.payment.status] || order.payment.status}</strong></p>
        <p>Ngày tạo: {dateTime(order.createdAt)}</p>

        <p>Tiền món: <strong>
          {money(order.subtotal)}
        </strong></p>
        <p>Phí giao: <strong>
          {money(order.shippingFee)}
        </strong></p>

        <p>Tổng giá trị ban đầu: <strong>
          {money(order.grandTotal)}
        </strong></p>
        <p>Địa chỉ: {order.deliveryAddress}</p>

        {order.amounts && <>
          <p>Giá trị sau điều chỉnh: <strong>
            {money(order.amounts.payableTotal)}
          </strong></p>
          <p>Còn phải thu: <strong>
            {money(order.amounts.amountDue)}
          </strong></p>
          <p>Đã thu / đã hoàn: {money(order.amounts.paidAmount)} / {money(order.amounts.refundedAmount)}</p>
          <p>Đang chờ hoàn: {money(order.amounts.pendingRefundAmount)}</p>
        </>}
      </div>

      {order.note && <p className="text-sm text-gray-500">Ghi chú: {order.note}</p>}

      <Notice>Admin giám sát đơn hàng. Các nút bên dưới chỉ dùng cho can thiệp ngoại lệ có lý do và được ghi lịch sử. Điều phối bếp, giao hàng và đối soát thuộc luồng vận hành.</Notice>

      {order.deliveries.map(day => <section key={day._id} className="rounded-2xl border border-gray-100 p-4 space-y-3">

        <div className="flex justify-between gap-3">
          <h3 className="font-black">
            {localDate(day.date)}
          </h3>
          <span className="text-sm font-bold text-gray-600">
            {statusLabels[day.status] || day.status}
          </span>
        </div>

        <p className="text-xs text-gray-500">Chốt bếp: {dateTime(day.cutoffAt)}</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="text-left text-xs text-gray-400">
              <tr>
                <th className="py-2">Món ăn</th>
                <th>Bữa</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
              </tr>
            </thead>
            <tbody>
              {day.items.map(item => <tr key={item._id} className="border-t border-gray-50">
                <td className="py-2">
                  {item.foodName}
                </td>
                <td>
                  {({ Breakfast: 'Sáng', Lunch: 'Trưa', Dinner: 'Tối', Snack: 'Phụ' } as Record<string, string>)[item.mealSlot || ''] || item.mealSlot || '—'}
                </td>
                <td>
                  {item.quantity}
                </td>
                <td>
                  {money(item.price)}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500">Tiền món: {money(day.subtotal)} · Phí giao: {money(day.shipping?.totalFee)} · Phí giao được miễn: {money(day.waivedShippingFee)}</p>

        <p className="text-xs text-gray-500 break-all">Bếp: {day.kitchenStaffIds?.join(', ') || 'Chưa gán'} · Giao hàng: {day.assignedShipperId || 'Chưa gán'}</p>

        {day.deliveryResult && <div className="rounded-xl bg-gray-50 p-3 text-sm space-y-1">
          {day.deliveryResult.reason && <p>Lý do giao thất bại: {day.deliveryResult.reason}</p>}
          {day.deliveryResult.codCollectedAmount !== undefined && <p>COD đã thu: {money(day.deliveryResult.codCollectedAmount)} · Cần thu: {money(day.deliveryResult.codExpectedAmount)} · Chênh lệch: {money(day.deliveryResult.codDifference)}</p>}
          {day.deliveryResult.evidenceUrls?.map((url, index) => <img key={index} src={url} alt={'Minh chứng giao hàng ' + (index + 1)} className="w-24 h-24 rounded-xl object-cover" />)}
        </div>}

        {day.cancellation && <p className="text-sm text-gray-500">Lý do hủy: {day.cancellation.reason} · Yêu cầu hoàn: {money(day.cancellation.refundAmount)}</p>}

        {day.statusHistory?.length ? <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-bold">Lịch sử ngày giao</summary>
          <ul className="mt-2 space-y-1">
            {day.statusHistory.map((item, index) => <li key={index}>{dateTime(item.changedAt)} · {statusLabels[item.status]}{item.reason ? ' · ' + item.reason : ''}</li>)}
          </ul>
        </details> : null}

        {!terminal && order.packageType === 'WEEKLY_7D' && <div className="flex flex-wrap gap-2">

          {nextDeliveryStatus(day.status) && <button
            className={secondaryClass}
            disabled={busy || !!weeklyStatusBlockReason(order, day)}
            title={weeklyStatusBlockReason(order, day) || undefined}
            onClick={() => choose({ kind: 'status', delivery: day, next: nextDeliveryStatus(day.status) })}>Ngoại lệ: chuyển sang {statusLabels[nextDeliveryStatus(day.status)!]}</button>}

          {nextDeliveryStatus(day.status) && weeklyStatusBlockReason(order, day) && <p className="w-full text-xs text-gray-500">{weeklyStatusBlockReason(order, day)}</p>}

          {['Pending', 'Confirmed'].includes(order.status) && ['Pending', 'Confirmed'].includes(day.status) && day.cutoffAt && new Date(day.cutoffAt).getTime() > Date.now() && <button className={secondaryClass + ' text-red-600'} disabled={busy} onClick={() => choose({ kind: 'cancel', delivery: day })}>Ngoại lệ: hủy ngày giao</button>}
        </div>}
      </section>)}

      {!terminal && order.packageType === 'ONE_DAY' && <div className="flex flex-wrap gap-2">

        {nextDeliveryStatus(order.status) && <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => choose({ kind: 'status', next: nextDeliveryStatus(order.status) })}>Ngoại lệ: chuyển sang {statusLabels[nextDeliveryStatus(order.status)!]}</button>}

        {['Pending', 'Failed'].includes(order.payment.status) && !(order.payment.paidAmount! > 0) && <button className={secondaryClass + ' text-red-600'} disabled={busy} onClick={() => choose({ kind: 'cancel' })}>Ngoại lệ: hủy đơn chưa thu tiền</button>}
      </div>}

      {action && <form onSubmit={submit} className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5 space-y-4">

        <h3 className="font-black">
          {action.kind === 'cancel' ? 'Xác nhận hủy ' + (action.delivery ? 'ngày ' + localDate(action.delivery.date) : 'đơn hàng') : 'Chuyển sang ' + statusLabels[action.next!] + (action.delivery ? ' · ' + localDate(action.delivery.date) : '')}
        </h3>

        {action.kind === 'cancel' && action.delivery && <>
          {preview.loading && <p role="status">Đang kiểm tra điều kiện và số tiền hủy...</p>}
          {preview.error && <Notice error>
            {preview.error}
          </Notice>}
          {previewIssue && <Notice error>{previewIssue}</Notice>}
          <button type="button" className={secondaryClass} disabled={busy || preview.loading} onClick={preview.reload}>Tải lại bản xem trước</button>
          {preview.data && <div className="text-sm space-y-1">
            <p>Giảm tiền món: {money(preview.data.foodCredit)} · Phí giao: {money(preview.data.shippingCredit)}</p>
            <p>Yêu cầu hoàn: <strong>
              {money(preview.data.refundAmount)}
            </strong> · Giá trị còn lại: {money(preview.data.remainingPayable)}</p>
            <p>Khoản hoàn được ghi nhận chờ xử lý, không tự hoàn tiền ngay.</p>
          </div>}
        </>}

        <label className="block text-sm font-bold">Lý do can thiệp ngoại lệ<textarea
          required
          minLength={3}
          maxLength={300}
          rows={3}
          className={fieldClass}
          value={reason}
          onChange={event => setReason(event.target.value)} /></label>

        <div className="flex gap-3">
          <button
            className={actionClass}
            disabled={busy || (action.kind === 'cancel' && !!action.delivery && (!preview.data || preview.loading || !!previewIssue))}>
            {busy ? 'Đang xử lý...' : 'Xác nhận can thiệp'}
          </button>
          <button type="button" className={secondaryClass} disabled={busy} onClick={() => setAction(null)}>Bỏ qua</button>
        </div>
      </form>}
    </>}
  </AdminModal>;
}
export default function AdminOrders() {
  const resource = useAdminResource<AdminOrder[]>('/orders/all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const rows = (resource.data || []).filter(order => [order.orderCode, order._id, order.userId, order.payment?.method].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <AdminPage title="Giám sát đơn hàng" {...resource} onReload={resource.reload}>

    <div className="flex flex-wrap gap-3">
      <input
        aria-label="Tìm đơn hàng"
        placeholder="Mã đơn, mã khách hàng, phương thức thanh toán..."
        className={fieldClass + ' md:!w-[28rem]'}
        value={search}
        onChange={event => setSearch(event.target.value)} />
      <select
        aria-label="Trạng thái đơn"
        value={status}
        onChange={event => setStatus(event.target.value)}
        className={fieldClass + ' md:!w-56'}>
        <option value="">Tất cả trạng thái</option>
        {orderStatuses.map(value => <option key={value} value={value}>
          {statusLabels[value]}
        </option>)}
      </select>
    </div>

    {!resource.loading && !resource.error && <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {orderStatuses.filter(value => !status || value === status).map(value => {
        const group = rows.filter(order => order.status === value);
        return <section key={value} className={panelClass + ' space-y-4'}>
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-black uppercase tracking-wider">
              {statusLabels[value]}
            </h2>
            <span className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-bold">
              {group.length}
            </span>
          </div>
          {group.length === 0 ? <p className="rounded-xl bg-gray-50 border border-dashed border-gray-200 p-4 text-sm text-gray-500 text-center">Chưa có đơn hàng.</p> : group.map(order => <article key={order._id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-black text-gray-900">
                  {order.orderCode || order._id}
                </p>
                <p className="text-xs text-gray-500">
                  {dateTime(order.createdAt)}
                </p>
              </div>
              <strong className="text-sm">
                {money(order.grandTotal)}
              </strong>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <p>{order.packageType === 'WEEKLY_7D' ? 'Gói 7 ngày' : 'Đơn ngày'} · {order.deliveries?.length || 0} ngày giao</p>
              <p>{order.payment?.method} · {paymentLabels[order.payment?.status] || order.payment?.status}</p>
              <p className="col-span-2 break-all">Khách hàng: {order.userId}</p>
            </div>
            <button className={secondaryClass} onClick={() => setSelectedId(order._id)}>Xem chi tiết</button>
          </article>)}
        </section>;
      })}
    </div>}

    {selectedId && <OrderDetail id={selectedId} onClose={() => setSelectedId('')} onChanged={resource.reload} />}
  </AdminPage>;
}
