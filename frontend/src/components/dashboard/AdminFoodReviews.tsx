import { useState, type FormEvent } from 'react';
import { actionClass, fieldClass, Notice, panelClass, secondaryClass, useAdminResource } from './AdminPage';
import { apiError, dateTime } from '@/lib/admin';
import api from '@/services/api';
type Review = { _id: string; reviewerId: string; orderId: string; deliveryId: string; rating: number; comment: string; images: string[]; createdAt: string; };
export default function AdminFoodReviews({ foodId, name, onChanged }: { foodId: string; name: string; onChanged: () => void; }) {
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState('');
  const [images, setImages] = useState('');
  const params = new URLSearchParams({ page: String(page), limit: '20', ...(rating ? { rating } : {}), ...(images ? { hasImages: images } : {}) });
  const resource = useAdminResource<Review[]>(`/reviews/Food/${foodId}?${params}`);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const hide = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (!reason.trim()) { setError('Vui lòng nhập lý do ẩn đánh giá.'); return; }
    setBusy(true); setError(''); setSuccess('');
    try { await api.patch(`/reviews/${selected}/hide`, { reason: reason.trim() }); setSelected(''); setReason(''); setSuccess('Đã ẩn đánh giá và thông báo lý do cho tác giả.'); resource.reload(); onChanged(); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  return <section className={panelClass + ' space-y-4'}>
    <h2 className="text-xl font-black text-gray-900">Đánh giá · {name}</h2>

    <div className="flex flex-wrap gap-3">
      <select
        aria-label="Lọc sao"
        value={rating}
        disabled={busy}
        onChange={event => { setRating(event.target.value); setPage(1); setSelected(''); }}
        className={fieldClass + ' md:!w-48'}>
        <option value="">Tất cả số sao</option>
        {[5, 4, 3, 2, 1].map(value => <option value={value} key={value}>{value} sao</option>)}
      </select>
      <select
        aria-label="Ảnh đánh giá"
        value={images}
        disabled={busy}
        onChange={event => { setImages(event.target.value); setPage(1); setSelected(''); }}
        className={fieldClass + ' md:!w-48'}>
        <option value="">Tất cả đánh giá</option>
        <option value="true">Có ảnh</option>
        <option value="false">Không có ảnh</option>
      </select>
      <button className={secondaryClass} disabled={busy || resource.loading} onClick={resource.reload}>Tải lại đánh giá</button>
    </div>

    {(error || resource.error) && <Notice error>
      {error || resource.error}
    </Notice>}
    {success && <Notice>
      {success}
    </Notice>}

    {resource.loading ? <p role="status" className="text-sm text-gray-500">Đang tải đánh giá...</p> : resource.data?.length === 0 ? <p className="text-sm text-gray-500 py-6">Không có đánh giá hiển thị phù hợp.</p> : resource.data?.map(review => <article key={review._id} className="p-4 border border-gray-100 rounded-2xl space-y-3">
      <div className="flex justify-between gap-3">
        <strong>{review.rating}/5 sao</strong>
        <span className="text-xs text-gray-500">
          {dateTime(review.createdAt)}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">
        {review.comment}
      </p>
      <p className="text-xs text-gray-500 break-all">Tác giả: {review.reviewerId} · Đơn: {review.orderId} · Ngày giao: {review.deliveryId}</p>
      <div className="flex flex-wrap gap-2">
        {review.images?.map((src, index) => <img key={index} src={src} alt={'Ảnh đánh giá ' + (index + 1)} className="h-20 w-20 rounded-xl object-cover" />)}
      </div>
      {selected === review._id ? <form onSubmit={hide} className="space-y-3">
        <label className="block text-sm font-bold">Lý do ẩn đánh giá<textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className={fieldClass} /></label>
        <p className="text-xs text-gray-500">Đánh giá sẽ không còn hiển thị; tác giả nhận được lý do và điểm món được tính lại.</p>
        <div className="flex gap-2">
          <button className={actionClass} disabled={busy}>
            {busy ? 'Đang xử lý...' : 'Xác nhận ẩn'}
          </button>
          <button type="button" className={secondaryClass} disabled={busy} onClick={() => setSelected('')}>Hủy</button>
        </div>
      </form> : <button
        className={secondaryClass + ' text-red-600'}
        disabled={busy}
        onClick={() => { setSelected(review._id); setReason(''); setError(''); setSuccess(''); }}>Ẩn đánh giá</button>}
    </article>)}

    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">Trang {page} · 20 đánh giá/trang</span>
      <div className="flex gap-2">
        <button
          className={secondaryClass}
          disabled={busy || resource.loading || page === 1}
          onClick={() => { setPage(page - 1); setSelected(''); }}>Trước</button>
        <button
          className={secondaryClass}
          disabled={busy || resource.loading || (resource.data?.length || 0) < 20}
          onClick={() => { setPage(page + 1); setSelected(''); }}>Sau</button>
      </div>
    </div>
  </section>;
}
