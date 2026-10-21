import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Plus, Edit2, MessageCircle, Upload } from 'lucide-react';
import AdminPage, { AdminModal, Notice, Pagination, actionClass, fieldClass, panelClass, secondaryClass, useAdminResource } from '@/components/dashboard/AdminPage';
import AdminFoodReviews from '@/components/dashboard/AdminFoodReviews';
import { apiError, money } from '@/lib/admin';
import { foodToForm, foodPayload, goalLabels, type FoodItem } from '@/lib/admin-food';
import api from '@/services/api';

type FoodList = { foods: FoodItem[]; pagination: { total: number; page: number; total_pages: number; }; };
export default function AdminMenu() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState('');
  const params = new URLSearchParams({ page: String(page), limit: '20', sortBy: 'createdAt', order: 'desc', ...(query ? { search: query } : {}), ...(goal ? { goalTags: goal } : {}) });
  const resource = useAdminResource<FoodList>('/foods?' + params);
  const [editing, setEditing] = useState<FoodItem | null | undefined>(undefined);
  const [form, setForm] = useState(() => foodToForm());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [reviewFood, setReviewFood] = useState<FoodItem | null>(null);
  const open = (food?: FoodItem) => { setEditing(food || null); setForm(foodToForm(food)); setFormError(''); setSuccess(''); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy || uploading) return;
    setBusy(true); setFormError('');
    try {
      const payload = foodPayload(form, editing?.reservedStock ?? 0);
      if (editing) await api.patch('/foods/' + editing._id, payload);
      else await api.post('/foods', { ...payload, isActive: true });
      setEditing(undefined); setSuccess('Đã lưu món ăn.'); resource.reload();
    } catch (err) { setFormError(apiError(err)); } finally { setBusy(false); }
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    event.target.value = '';
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setFormError('Chọn ảnh không quá 5MB.'); return; }
    setUploading(true); setFormError('');
    try {
      const body = new FormData(); body.append('image', file);
      const response = await api.post('/medias/upload-image', body);
      const url = response.data.result?.[0];
      if (typeof url !== 'string' || !url) throw new Error('Không nhận được đường dẫn ảnh.');
      setForm(previous => ({ ...previous, images: [previous.images.trim(), url].filter(Boolean).join('\n') }));
    } catch (err) { setFormError(apiError(err)); } finally { setUploading(false); }
  };
  const toggle = async (food: FoodItem) => {
    if (busy) return; setBusy(true); setError(''); setSuccess('');
    try { await api.patch('/foods/' + food._id, { isActive: !food.isActive }); resource.reload(); setSuccess(food.isActive ? 'Đã ẩn món khỏi danh mục bán.' : 'Đã mở bán món.'); }
    catch (err) { setError(apiError(err)); } finally { setBusy(false); }
  };
  const rows = (resource.data?.foods || []).filter(food => !status || (status === 'active' ? food.isActive : !food.isActive));
  return <AdminPage title="Quản lý món ăn" {...resource} onReload={busy ? undefined : resource.reload}>

    {error && <Notice error>
      {error}
    </Notice>}
    {success && <Notice>
      {success}
    </Notice>}

    <section className={panelClass + ' space-y-5'}>

      <div className="flex justify-between items-center gap-4">
        <h2 className="text-xl font-black text-gray-900">Danh mục món ăn</h2>
        <button className={actionClass} disabled={busy} onClick={() => open()}><Plus size={16} />Thêm món ăn</button>
      </div>

      <form onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); }} className="flex flex-wrap gap-3">

        <input
          aria-label="Tìm món ăn"
          className={fieldClass + ' md:!w-64'}
          placeholder="Tìm tên món, có hoặc không dấu..."
          value={search}
          onChange={event => setSearch(event.target.value)} />

        <select
          aria-label="Mục tiêu dinh dưỡng"
          className={fieldClass + ' md:!w-48'}
          value={goal}
          onChange={event => { setGoal(event.target.value); setPage(1); }}>
          <option value="">Tất cả mục tiêu</option>
          {Object.entries(goalLabels).map(([key, label]) => <option key={key} value={key}>
            {label}
          </option>)}
        </select>

        <select
          aria-label="Trạng thái món trên trang"
          className={fieldClass + ' md:!w-56'}
          value={status}
          onChange={event => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang bán (trên trang)</option>
          <option value="inactive">Đã ẩn (trên trang)</option>
        </select>
        <button className={secondaryClass}>Tìm kiếm</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="text-xs uppercase text-gray-400 border-b border-gray-100">
            <tr>
              {['Món ăn', 'Giá', 'Dinh dưỡng', 'Tồn kho', 'Trạng thái', 'Thao tác'].map(label => <th key={label} className="p-4">
                {label}
              </th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(food => <tr key={food._id} className="hover:bg-gray-50/60">
              <td className="p-4">
                <div className="flex gap-3 items-center">
                  <img src={food.images?.[0]} alt={food.name} className="w-12 h-12 rounded-xl object-cover bg-gray-50" />
                  <div>
                    <p className="font-bold text-gray-900">
                      {food.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {food.goalTags?.map(value => goalLabels[value] || value).join(' · ')}
                    </p>
                    <p className="text-xs text-gray-400">{food.rating ?? 0}/5 · {food.reviewCount ?? 0} đánh giá</p>
                  </div>
                </div>
              </td>
              <td className="p-4 font-black whitespace-nowrap">
                {money(food.price)}
              </td>
              <td className="p-4 text-xs text-gray-600">
                <p>{food.calories} kcal</p>
                <p>P: {food.nutrition?.protein ?? 0}g · C: {food.nutrition?.carb ?? 0}g · F: {food.nutrition?.fat ?? 0}g</p>
              </td>
              <td className="p-4 text-xs">
                <p>Tổng: {food.stock}</p>
                <p>Đang giữ: {food.reservedStock ?? 0}</p>
                <strong>Có thể bán: {food.availability?.availableQuantity ?? Math.max(0, food.stock - (food.reservedStock ?? 0))}</strong>
              </td>
              <td className="p-4">
                <span
                  className={'px-3 py-1 rounded-lg text-xs font-bold ' + (food.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')}>
                  {food.isActive ? 'Đang bán' : 'Đã ẩn'}
                </span>
              </td>
              <td className="p-4">
                <div className="flex flex-wrap gap-2">
                  <button className={secondaryClass} disabled={busy} onClick={() => open(food)}><Edit2 size={14} />Sửa</button>
                  <button className={secondaryClass} disabled={busy} onClick={() => toggle(food)}>
                    {food.isActive ? 'Ẩn món' : 'Mở bán'}
                  </button>
                  <button className={secondaryClass} onClick={() => setReviewFood(food)}><MessageCircle size={14} />Đánh giá</button>
                </div>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>

      {!resource.loading && !resource.error && rows.length === 0 && <p className="text-center text-gray-500 py-8">Không có món phù hợp trên trang này.</p>}

      {resource.data && <Pagination page={page} total={resource.data.pagination.total} limit={20} onPage={setPage} busy={resource.loading || busy} />}
    </section>

    {reviewFood && <AdminFoodReviews key={reviewFood._id} foodId={reviewFood._id} name={reviewFood.name} onChanged={resource.reload} />}

    {editing !== undefined && <AdminModal title={editing ? 'Chỉnh sửa món ăn' : 'Thêm món ăn'} busy={busy || uploading} onClose={() => setEditing(undefined)}>

      <form onSubmit={save} className="space-y-5">

        {formError && <Notice error>
          {formError}
        </Notice>}

        <label className="block text-sm font-bold space-y-1">Tên món<input required className={fieldClass} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>

        <label className="block text-sm font-bold space-y-1">Mô tả<textarea
          required
          rows={3}
          className={fieldClass}
          value={form.description}
          onChange={event => setForm({ ...form, description: event.target.value })} /></label>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {([['price', 'Giá (đ)'], ['calories', 'Calo (kcal)'], ['stock', 'Tồn kho tổng'], ['protein', 'Protein (g)'], ['carb', 'Carb (g)'], ['fat', 'Fat (g)']] as const).map(([key, label]) => <label key={key} className="text-sm font-bold space-y-1">
            {label}
            <input
              required
              type="number"
              min={key === 'price' ? '0.01' : key === 'stock' ? editing?.reservedStock ?? 0 : 0}
              step={key === 'stock' ? '1' : 'any'}
              className={fieldClass}
              value={form[key]}
              onChange={event => setForm({ ...form, [key]: event.target.value })} />
          </label>)}
        </div>

        {editing && <p className="text-xs text-gray-500">Đang giữ cho đơn chờ: {editing.reservedStock ?? 0}. Tồn kho tổng không được thấp hơn lượng đang giữ.</p>}

        <label className="block text-sm font-bold space-y-1">Ảnh món ăn (mỗi đường dẫn một dòng)<textarea
          required
          rows={3}
          className={fieldClass}
          value={form.images}
          onChange={event => setForm({ ...form, images: event.target.value })} /></label>

        <label className="inline-flex items-center gap-2 text-sm font-bold text-blue-700">
          <Upload size={16} />
          {uploading ? 'Đang tải ảnh...' : 'Thêm ảnh từ máy'}
          <input type="file" accept="image/*" className="max-w-56" disabled={uploading || busy} onChange={upload} />
        </label>

        <div className="flex gap-2 flex-wrap">
          {form.images.split('\n').filter(Boolean).map((image, index) => <img key={index} src={image} alt={'Ảnh món ' + (index + 1)} className="w-20 h-20 rounded-xl object-cover" />)}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Mục tiêu dinh dưỡng</legend>
          <div className="flex gap-5 flex-wrap">
            {Object.entries(goalLabels).map(([value, label]) => <label key={value} className="text-sm flex gap-2 items-center">
              <input
                type="checkbox"
                checked={form.goalTags.includes(value)}
                onChange={event => setForm({ ...form, goalTags: event.target.checked ? [...form.goalTags, value] : form.goalTags.filter(goal => goal !== value) })} />
              {label}
            </label>)}
          </div>
        </fieldset>

        <label className="block text-sm font-bold space-y-1">Nhãn món (ngăn cách bằng dấu phẩy)<input className={fieldClass} value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} /></label>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">Nguyên liệu và dị ứng</legend>
          {form.ingredients.map((ingredient, index) => <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
            <label className="text-xs text-gray-500">Tên nguyên liệu<input
              required
              className={fieldClass}
              value={ingredient.name}
              onChange={event => setForm({ ...form, ingredients: form.ingredients.map((item, i) => i === index ? { ...item, name: event.target.value } : item) })} /></label>
            <label className="text-xs text-gray-500">Dị ứng (ngăn cách bằng dấu phẩy)<input
              className={fieldClass}
              value={ingredient.allergyTags}
              onChange={event => setForm({ ...form, ingredients: form.ingredients.map((item, i) => i === index ? { ...item, allergyTags: event.target.value } : item) })} /></label>
            <button
              type="button"
              className={secondaryClass}
              disabled={form.ingredients.length <= 1}
              onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== index) })}>Bỏ</button>
          </div>)}
          <button
            type="button"
            className={secondaryClass}
            onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { name: '', allergyTags: '' }] })}>Thêm nguyên liệu</button>
        </fieldset>

        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryClass} disabled={busy || uploading} onClick={() => setEditing(undefined)}>Hủy</button>
          <button className={actionClass} disabled={busy || uploading}>
            {busy ? 'Đang lưu...' : 'Lưu món ăn'}
          </button>
        </div>
      </form>
    </AdminModal>}
  </AdminPage>;
}
