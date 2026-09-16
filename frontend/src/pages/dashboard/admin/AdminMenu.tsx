import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { ChefHat, Edit2, Loader2, MessageCircle, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import api from '@/services/api';

type OrderStatus = 'Pending' | 'Cooking' | 'Delivering' | 'Completed' | 'Cancelled';

type FoodItem = {
  _id: string;
  name: string;
  description?: string;
  details?: string;
  images?: string[];
  price: number;
  calories: number;
  nutrition?: {
    protein?: number;
    carb?: number;
    fat?: number;
  };
  ingredients?: Array<{
    name?: string;
    allergyTags?: string[];
  }>;
  tags?: string[];
  stock: number;
  isActive: boolean;
  isCombo?: boolean;
};

type KitchenOrder = {
  _id: string;
  status: OrderStatus;
  deliveryAddress?: string;
  items?: Array<{ quantity?: number }>;
  grandTotal?: number;
  createdAt?: string;
};

type FoodReview = {
  _id: string;
  reviewerId?: string;
  rating?: number;
  comment?: string;
  createdAt?: string;
};

type FoodFormValues = {
  name: string;
  description: string;
  details: string;
  image: string;
  price: string;
  calories: string;
  stock: string;
  protein: string;
  carb: string;
  fat: string;
  tags: string;
  ingredientName: string;
  allergyTags: string;
  isCombo: boolean;
};

const emptyForm: FoodFormValues = {
  name: '',
  description: '',
  details: '',
  image: '',
  price: '',
  calories: '',
  stock: '',
  protein: '',
  carb: '',
  fat: '',
  tags: '',
  ingredientName: '',
  allergyTags: '',
  isCombo: false
};

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPositiveNumber(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

export default function AdminMenu() {
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [actionFoodId, setActionFoodId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [showModal, setShowModal] = useState(false);
  const [editFood, setEditFood] = useState<FoodItem | null>(null);
  const [formData, setFormData] = useState<FoodFormValues>(emptyForm);
  const [selectedFoodReviewId, setSelectedFoodReviewId] = useState<string>('');
  const [foodReviews, setFoodReviews] = useState<FoodReview[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [isDeletingReviewId, setIsDeletingReviewId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setWarning(null);

      const [foodsRes, ordersRes] = await Promise.all([
        api.get('/foods?page=1&limit=300&sortBy=createdAt&order=desc'),
        api.get('/orders/all')
      ]);

      const foodData = Array.isArray(foodsRes.data?.result?.foods) ? foodsRes.data.result.foods : [];
      const allOrders = Array.isArray(ordersRes.data?.result) ? ordersRes.data.result : [];

      setFoods(foodData);
      setKitchenOrders(
        allOrders
          .filter((order: KitchenOrder) => ['Pending', 'Cooking', 'Delivering'].includes(order.status))
          .sort((a: KitchenOrder, b: KitchenOrder) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 6)
      );
    } catch (error: any) {
      console.error('Loi tai du lieu admin menu:', error);
      setWarning(error?.response?.data?.message || 'Khong the tai du lieu quan ly bep.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const loadFoodReviews = async (foodId: string) => {
    if (!foodId) {
      setFoodReviews([]);
      return;
    }

    try {
      setIsLoadingReviews(true);
      const res = await api.get(`/reviews/Food/${foodId}`);
      setFoodReviews(Array.isArray(res.data?.result) ? res.data.result : []);
    } catch (error: any) {
      setFoodReviews([]);
      setWarning(error?.response?.data?.message || 'Khong the tai review mon an.');
    } finally {
      setIsLoadingReviews(false);
    }
  };

  useEffect(() => {
    if (foods.length === 0) return;
    if (!selectedFoodReviewId) {
      const firstFoodId = foods[0]?._id || '';
      setSelectedFoodReviewId(firstFoodId);
      loadFoodReviews(firstFoodId);
    }
  }, [foods, selectedFoodReviewId]);

  const handleSelectFoodReview = async (foodId: string) => {
    setSelectedFoodReviewId(foodId);
    await loadFoodReviews(foodId);
  };

  const handleDeleteFoodReview = async (reviewId: string) => {
    if (!selectedFoodReviewId) return;

    try {
      setIsDeletingReviewId(reviewId);
      setWarning(null);
      await api.delete(`/reviews/${reviewId}`);
      await loadFoodReviews(selectedFoodReviewId);
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the xoa review mon an.');
    } finally {
      setIsDeletingReviewId(null);
    }
  };

  const filteredFoods = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return foods.filter((item) => {
      const matchSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item._id.toLowerCase().includes(query) ||
        (item.tags || []).join(' ').toLowerCase().includes(query);

      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.isActive) ||
        (statusFilter === 'inactive' && !item.isActive);

      return matchSearch && matchStatus;
    });
  }, [foods, searchQuery, statusFilter]);

  const openCreateModal = () => {
    setEditFood(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (food: FoodItem) => {
    setEditFood(food);
    setFormData({
      name: food.name || '',
      description: food.description || '',
      details: food.details || '',
      image: food.images?.[0] || '',
      price: String(food.price ?? ''),
      calories: String(food.calories ?? ''),
      stock: String(food.stock ?? ''),
      protein: String(food.nutrition?.protein ?? ''),
      carb: String(food.nutrition?.carb ?? ''),
      fat: String(food.nutrition?.fat ?? ''),
      tags: (food.tags || []).join(', '),
      ingredientName: food.ingredients?.[0]?.name || '',
      allergyTags: (food.ingredients?.[0]?.allergyTags || []).join(', '),
      isCombo: Boolean(food.isCombo)
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditFood(null);
    setFormData(emptyForm);
  };

  const buildFoodPayload = () => {
    const tags = parseCsv(formData.tags);
    const allergyTags = parseCsv(formData.allergyTags);

    return {
      name: formData.name.trim(),
      description: formData.description.trim(),
      details: formData.details.trim(),
      images: [formData.image.trim() || 'https://picsum.photos/seed/food/600/400'],
      price: toPositiveNumber(formData.price),
      calories: toPositiveNumber(formData.calories),
      nutrition: {
        protein: toPositiveNumber(formData.protein),
        carb: toPositiveNumber(formData.carb),
        fat: toPositiveNumber(formData.fat)
      },
      ingredients: [
        {
          name: formData.ingredientName.trim() || 'Unknown ingredient',
          allergyTags
        }
      ],
      tags,
      stock: Math.floor(toPositiveNumber(formData.stock)),
      isCombo: formData.isCombo
    };
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setWarning('Vui long chon dung file anh.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setWarning('Anh vuot qua 5MB. Vui long chon file nho hon.');
      return;
    }

    try {
      setIsImageUploading(true);
      setWarning(null);

      const uploadData = new FormData();
      uploadData.append('image', file);

      const uploadRes = await api.post('/medias/upload-image', uploadData);
      const uploadedUrl = uploadRes.data?.result?.[0];

      if (!uploadedUrl || typeof uploadedUrl !== 'string') {
        throw new Error('Upload thanh cong nhung khong nhan duoc URL anh.');
      }

      setFormData((prev) => ({ ...prev, image: uploadedUrl }));
    } catch (error: any) {
      setWarning(error?.response?.data?.message || error?.message || 'Khong the upload anh mon an.');
    } finally {
      setIsImageUploading(false);
      event.target.value = '';
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setWarning(null);

      const payload = buildFoodPayload();

      if (editFood?._id) {
        await api.patch(`/foods/${editFood._id}`, payload);
      } else {
        await api.post('/foods', {
          ...payload,
          isActive: true
        });
      }

      closeModal();
      await fetchData();
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the luu mon an. Vui long kiem tra du lieu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: FoodItem) => {
    try {
      setActionFoodId(item._id);
      setWarning(null);
      await api.patch(`/foods/${item._id}`, { isActive: !item.isActive });
      setFoods((prev) => prev.map((food) => (food._id === item._id ? { ...food, isActive: !food.isActive } : food)));
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the cap nhat trang thai mon an.');
    } finally {
      setActionFoodId(null);
    }
  };

  const handleSoftDelete = async (item: FoodItem) => {
    try {
      setActionFoodId(item._id);
      setWarning(null);
      await api.delete(`/foods/${item._id}`);
      setFoods((prev) => prev.map((food) => (food._id === item._id ? { ...food, isActive: false } : food)));
    } catch (error: any) {
      setWarning(error?.response?.data?.message || 'Khong the an mon an nay.');
    } finally {
      setActionFoodId(null);
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
        <Header title="Quản lý bếp và tình trạng đơn" userRole="Quản trị viên" hideSearch={true} />

        <main className="p-8 space-y-8 overflow-y-auto min-w-0">
          {warning ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {warning}
            </div>
          ) : null}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">Bếp và giao hàng</h2>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Đơn đang xử lý: {kitchenOrders.length}</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {kitchenOrders.length === 0 ? (
                <div className="col-span-full rounded-3xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
                  Chưa có đơn hàng nào đang được xử lý bởi bếp hoặc giao hàng.
                </div>
              ) : (
                kitchenOrders.map((order) => {
                  const quantity = (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

                  return (
                    <article key={order._id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-gray-900">Order #{order._id.slice(-6).toUpperCase()}</p>
                          <p className="text-xs text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : 'N/A'}</p>
                        </div>
                        <span
                          className={cn(
                            'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider',
                            order.status === 'Pending' && 'bg-amber-100 text-amber-700',
                            order.status === 'Cooking' && 'bg-blue-100 text-blue-600',
                            order.status === 'Delivering' && 'bg-indigo-100 text-indigo-700'
                          )}
                        >
                          {order.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <p className="inline-flex items-center gap-1"><ChefHat size={14} /> So mon: <span className="font-bold text-gray-900">{quantity}</span></p>
                        <p className="inline-flex items-center gap-1"><Truck size={14} /> Tong tien: <span className="font-bold text-gray-900">{Math.round(order.grandTotal || 0).toLocaleString('vi-VN')} d</span></p>
                      </div>

                      <p className="text-xs text-gray-500 line-clamp-2">Dia chi: {order.deliveryAddress || 'Chua co dia chi giao hang'}</p>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-black text-gray-900 uppercase">Quản lý món ăn</h2>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Tìm tên món, ID, tag..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-11 w-72 pl-10 pr-4 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500/10"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="h-11 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 outline-none focus:ring-2 focus:ring-orange-500/10"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="active">Đang bán</option>
                  <option value="inactive">Đã ẩn</option>
                </select>

                <Button type="button" onClick={openCreateModal} className="h-11 rounded-xl bg-[#c1e06d] text-gray-900 font-black hover:bg-[#b1d05d]">
                  <Plus size={16} className="mr-2" /> Thêm món ăn
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-[28px] shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full min-w-[1100px] text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/40">
                    <th className="px-6 py-4">Tên món ăn</th>
                    <th className="px-6 py-4">Giá</th>
                    <th className="px-6 py-4">Dinh dưỡng</th>
                    <th className="px-6 py-4">Còn hàng</th>
                    <th className="px-6 py-4">Trang thái</th>
                    <th className="px-6 py-4">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredFoods.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500 font-medium">
                        Không tìm thấy món ăn nào phù hợp với tiêu chí của bạn.
                      </td>
                    </tr>
                  ) : (
                    filteredFoods.map((item) => {
                      const isActing = actionFoodId === item._id;

                      return (
                        <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={item.images?.[0] || 'https://picsum.photos/seed/food/120/120'}
                                alt={item.name}
                                className="w-12 h-12 rounded-xl object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <p className="text-sm font-bold text-gray-900">{item.name}</p>
                                <p className="text-[11px] text-gray-400">{item._id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-gray-900">
                            {Math.round(item.price || 0).toLocaleString('vi-VN')} d
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 space-y-1">
                            <p>Protein: <span className="font-bold text-gray-900">{item.nutrition?.protein ?? 0}g</span></p>
                            <p>Carb: <span className="font-bold text-gray-900">{item.nutrition?.carb ?? 0}g</span></p>
                            <p>Fat: <span className="font-bold text-gray-900">{item.nutrition?.fat ?? 0}g</span></p>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-700">{item.stock}</td>
                          <td className="px-6 py-4">
                            <span
                              className={cn(
                                'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider',
                                item.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                              )}
                            >
                              {item.isActive ? 'Dang ban' : 'Da an'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleToggleStatus(item)}
                                className={cn(
                                  'relative w-12 h-6 rounded-full transition-colors duration-200 disabled:opacity-50',
                                  item.isActive ? 'bg-[#c1e06d]' : 'bg-gray-300'
                                )}
                              >
                                <span
                                  className={cn(
                                    'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200',
                                    item.isActive ? 'translate-x-6' : 'translate-x-0'
                                  )}
                                />
                              </button>

                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => openEditModal(item)}
                                className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                              >
                                <Edit2 size={16} />
                              </button>

                              <button
                                type="button"
                                disabled={isActing || !item.isActive}
                                onClick={() => handleSoftDelete(item)}
                                className="p-2 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                              >
                                <Trash2 size={16} />
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
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <h2 className="text-xl font-black text-gray-900 uppercase inline-flex items-center gap-2">
                <MessageCircle size={20} className="text-orange-500" /> Review món ăn
              </h2>
              <select
                value={selectedFoodReviewId}
                onChange={(e) => handleSelectFoodReview(e.target.value)}
                className="h-11 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-orange-500/10"
              >
                {foods.map((food) => (
                  <option key={food._id} value={food._id}>
                    {food.name} {food.isCombo ? '(Combo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white rounded-[28px] shadow-sm border border-gray-100 p-5 space-y-3">
              {isLoadingReviews ? (
                <div className="py-8 text-center text-sm text-gray-500">Đang tải review...</div>
              ) : foodReviews.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">Món ăn này chưa có review nào.</div>
              ) : (
                foodReviews.map((review) => (
                  <article key={review._id} className="rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-gray-900">{Number(review.rating || 0).toFixed(1)} / 5</p>
                      <button
                        type="button"
                        disabled={isDeletingReviewId === review._id}
                        onClick={() => handleDeleteFoodReview(review._id)}
                        className="inline-flex items-center gap-2 px-3 h-9 rounded-xl border border-red-200 text-red-600 text-xs font-black disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        {isDeletingReviewId === review._id ? 'Đang xóa...' : 'Xóa review'}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{review.comment || 'Không có nội dung'}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      User: {String(review.reviewerId || '').slice(-6)} • {review.createdAt ? new Date(review.createdAt).toLocaleDateString('vi-VN') : ''}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-[32px] shadow-2xl max-w-3xl w-full p-7 space-y-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-gray-900">{editFood ? 'Chỉnh sửa món ăn' : 'Thêm món ăn mới'}</h3>
              <button type="button" onClick={closeModal} className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Tên món ăn"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <input
                  type="text"
                  required
                  placeholder="Giá (VND)"
                  value={formData.price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, price: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
              </div>

              <textarea
                required
                rows={3}
                placeholder="Mô tả ngắn gọn về món ăn"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
              />

              <textarea
                rows={2}
                placeholder="Thông tin chi tiết (tùy chọn, có thể là nguyên liệu, cách chế biến,...)"
                value={formData.details}
                onChange={(e) => setFormData((prev) => ({ ...prev, details: e.target.value }))}
                className="w-full px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Calories"
                  value={formData.calories}
                  onChange={(e) => setFormData((prev) => ({ ...prev, calories: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <input
                  type="text"
                  required
                  placeholder="Còn hàng (số lượng)"
                  value={formData.stock}
                  onChange={(e) => setFormData((prev) => ({ ...prev, stock: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Image URL"
                    value={formData.image}
                    onChange={(e) => setFormData((prev) => ({ ...prev, image: e.target.value }))}
                    className="h-12 w-full px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                  />
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 cursor-pointer">
                    <Upload size={14} />
                    {isImageUploading ? 'Đang upload...' : 'Upload ảnh từ máy tính'}
                    <input type="file" accept="image/*" onChange={handleImageFileChange} className="hidden" disabled={isImageUploading} />
                  </label>
                </div>
              </div>

              {formData.image ? (
                <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                  <p className="text-[11px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Xem trước ảnh</p>
                  <img
                    src={formData.image}
                    alt="Food preview"
                    className="w-full h-44 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  type="text"
                  required
                  placeholder="Protein (g)"
                  value={formData.protein}
                  onChange={(e) => setFormData((prev) => ({ ...prev, protein: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <input
                  type="text"
                  required
                  placeholder="Carb (g)"
                  value={formData.carb}
                  onChange={(e) => setFormData((prev) => ({ ...prev, carb: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <input
                  type="text"
                  required
                  placeholder="Fat (g)"
                  value={formData.fat}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fat: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Tags (sử dụng dấu phẩy để ngăn cách)"
                  value={formData.tags}
                  onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <label className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.isCombo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, isCombo: e.target.checked }))}
                  />
                  là combo
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nguyên liệu chính (ví dụ: 'Thịt bò, rau củ,...')"
                  value={formData.ingredientName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ingredientName: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
                <input
                  type="text"
                  placeholder="Allergy tags (sử dụng dấu phẩy để ngăn cách)"
                  value={formData.allergyTags}
                  onChange={(e) => setFormData((prev) => ({ ...prev, allergyTags: e.target.value }))}
                  className="h-12 px-4 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-[#c1e06d]/40"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || isImageUploading}
                className="w-full h-12 bg-[#c1e06d] text-gray-900 rounded-2xl font-black hover:bg-[#b1d05d] disabled:opacity-60"
              >
                {isImageUploading ? 'Đang upload ảnh...' : isSubmitting ? 'Đang lưu...' : editFood ? 'Lưu chỉnh sửa' : 'Tạo món ăn'}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
