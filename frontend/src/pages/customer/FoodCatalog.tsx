import { useState, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  Plus,
  Flame,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  Star,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { cn } from '@/lib/utils';
import Navbar from '@/components/layout/Navbar';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const categories = ['Tất cả', 'Giảm cân', 'Tăng cơ', 'Ăn chay', 'Ít tinh bột'];

const categoryToTagsMap: Record<string, string[]> = {
  'Giảm cân': ['LowCalorie', 'LowFat'],
  'Tăng cơ': ['HighProtein'],
  'Ăn chay': ['Vegan'],
  'Ít tinh bột': ['GlutenFree'],
};

export default function FoodCatalog() {
  const { user, isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Lọc cá nhân hóa dị ứng (FR-CAT-003: Mặc định true khi đã đăng nhập)
  const [excludeMyAllergens, setExcludeMyAllergens] = useState(true);

  // Bộ lọc nâng cao
  const [minCalories, setMinCalories] = useState<string>('');
  const [maxCalories, setMaxCalories] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'calories_asc' | 'calories_desc' | 'name' | 'newest'>('newest');
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // State dữ liệu & phân trang
  const [foodItems, setFoodItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [personalFilterApplied, setPersonalFilterApplied] = useState(false);

  // Debounce tìm kiếm 0.4s
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset về trang 1 khi đổi tiêu chí lọc
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeCategory, excludeMyAllergens, minCalories, maxCalories, minPrice, maxPrice, sortBy]);

  // Gọi API lấy danh sách món ăn từ Backend (GET /foods)
  const fetchFoods = async () => {
    try {
      setIsLoading(true);

      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '12');

      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }

      if (activeCategory !== 'Tất cả') {
        const tags = categoryToTagsMap[activeCategory];
        if (tags && tags.length > 0) {
          params.append('tags', tags.join(','));
        }
      }

      if (isAuthenticated) {
        params.append('excludeMyAllergens', excludeMyAllergens ? 'true' : 'false');
      }

      if (minCalories) params.append('minCalories', minCalories);
      if (maxCalories) params.append('maxCalories', maxCalories);
      if (minPrice) params.append('minPrice', minPrice);
      if (maxPrice) params.append('maxPrice', maxPrice);

      // Sắp xếp
      switch (sortBy) {
        case 'price_asc':
          params.append('sortBy', 'price');
          params.append('order', 'asc');
          break;
        case 'price_desc':
          params.append('sortBy', 'price');
          params.append('order', 'desc');
          break;
        case 'calories_asc':
          params.append('sortBy', 'calories');
          params.append('order', 'asc');
          break;
        case 'calories_desc':
          params.append('sortBy', 'calories');
          params.append('order', 'desc');
          break;
        case 'name':
          params.append('sortBy', 'name');
          params.append('order', 'asc');
          break;
        case 'newest':
        default:
          params.append('sortBy', 'created_at');
          params.append('order', 'desc');
          break;
      }

      const res = await api.get(`/foods?${params.toString()}`);
      const result = res.data?.result || {};

      setFoodItems(result.foods || []);
      setTotalPages(result.pagination?.total_pages || 1);
      setTotalItems(result.pagination?.total_items || result.foods?.length || 0);
      setPersonalFilterApplied(Boolean(result.filters?.personalAllergyFilterApplied));
    } catch (error) {
      console.error('Lỗi khi tải thực đơn:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFoods();
  }, [page, debouncedSearch, activeCategory, excludeMyAllergens, minCalories, maxCalories, minPrice, maxPrice, sortBy]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24 space-y-6">
        {/* Header & Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Thực đơn dinh dưỡng FitBite</h1>
            <p className="text-sm text-slate-500 mt-1">
              Khám phá các món ăn lành mạnh được tính toán calo và macro chuẩn xác
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Tìm món ăn (tiếng Việt có dấu/không dấu)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-sm"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => setShowFiltersModal(!showFiltersModal)}
              className="rounded-2xl p-2.5 min-h-[44px] flex items-center gap-1.5 bg-white"
            >
              <SlidersHorizontal size={18} className="text-slate-600" />
              <span className="hidden sm:inline text-xs font-bold">Lọc</span>
            </Button>
          </div>
        </div>

        {/* Categories Bar & Toggle Loại trừ Dị ứng (FR-CAT-003) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex overflow-x-auto gap-1.5 scrollbar-none pb-1 sm:pb-0">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[38px]',
                  activeCategory === category
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Toggle Loại trừ Dị ứng cá nhân */}
          {isAuthenticated && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50/60 border border-orange-100 rounded-xl text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-orange-900 select-none">
                <input
                  type="checkbox"
                  checked={excludeMyAllergens}
                  onChange={(e) => setExcludeMyAllergens(e.target.checked)}
                  className="rounded text-orange-500 focus:ring-orange-500"
                />
                <ShieldCheck size={16} className="text-orange-600" />
                <span>Loại trừ dị ứng của tôi</span>
              </label>
              {personalFilterApplied && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  Đang lọc
                </span>
              )}
            </div>
          )}
        </div>

        {/* Modal Bộ lọc Nâng cao (Calo, Giá, Sắp xếp) */}
        {showFiltersModal && (
          <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-md space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Bộ lọc nâng cao</h3>
              <button onClick={() => setShowFiltersModal(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Khoảng Kcal</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={minCalories}
                    onChange={(e) => setMinCalories(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-xl"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={maxCalories}
                    onChange={(e) => setMaxCalories(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Khoảng Giá (VNĐ)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min VNĐ"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-xl"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    placeholder="Max VNĐ"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sắp xếp theo</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border rounded-xl bg-white"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá: Thấp đến Cao</option>
                  <option value="price_desc">Giá: Cao đến Thấp</option>
                  <option value="calories_asc">Calo: Ít đến Nhiều</option>
                  <option value="calories_desc">Calo: Nhiều đến Ít</option>
                  <option value="name">Tên A-Z</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 4 Trạng thái NFR-USA-003: Loading, Empty, Data, Error */}
        {isLoading ? (
          <div className="text-center py-24 space-y-3">
            <RefreshCw className="animate-spin text-orange-500 mx-auto" size={36} />
            <p className="text-slate-500 text-sm font-medium">Đang tải danh sách món ăn dinh dưỡng...</p>
          </div>
        ) : foodItems.length === 0 ? (
          /* Trạng thái rỗng (Empty State) */
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <XCircle className="mx-auto text-slate-300" size={48} />
            <h3 className="text-xl font-bold text-slate-800">Không tìm thấy món ăn phù hợp</h3>
            <p className="text-slate-400 text-xs max-w-sm mx-auto">
              Thử tìm kiếm với từ khóa khác hoặc điều chỉnh lại bộ lọc calo, giá hoặc dị ứng.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('Tất cả');
                setMinCalories('');
                setMaxCalories('');
                setMinPrice('');
                setMaxPrice('');
              }}
              className="min-h-[40px]"
            >
              Đặt lại tất cả bộ lọc
            </Button>
          </div>
        ) : (
          /* Lưới món ăn */
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {foodItems.map((food, index) => {
                const hasAllergyWarning = Boolean(food.allergyWarning?.hasMatch);
                const matchedAllergens = food.allergyWarning?.matchedAllergens || [];
                const inStock = food.availability ? food.availability.inStock : food.stock > 0;
                const availableQuantity = food.availability ? food.availability.availableQuantity : food.stock;

                return (
                  <Link to={`/food/${food._id}`} key={food._id}>
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group border border-slate-200/80 flex flex-col h-full relative"
                    >
                      {/* Image Thumbnail */}
                      <div className="aspect-[4/3] relative overflow-hidden bg-slate-100">
                        <img
                          src={food.images?.[0] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'}
                          alt={food.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
                          }}
                        />

                        {/* Badge Calo */}
                        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm text-xs font-bold text-slate-800">
                          <Flame size={14} className="text-orange-500" />
                          <span>{food.calories || 0} kcal</span>
                        </div>

                        {/* Hết hàng badge */}
                        {!inStock && (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="px-3 py-1 bg-red-600 text-white rounded-full font-bold text-xs uppercase tracking-wider">
                              Hết hàng
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-5 flex flex-col flex-1 space-y-3">
                        {/* Cảnh báo dị ứng có Icon + Chữ (FR-CAT-004, NFR-LEG-002) */}
                        {hasAllergyWarning && (
                          <div className="p-2 bg-red-50 border border-red-200 rounded-xl flex items-center gap-1.5 text-red-700 text-[11px] font-bold">
                            <AlertTriangle size={14} className="text-red-600 flex-shrink-0" />
                            <span className="line-clamp-1">Trùng dị ứng: {matchedAllergens.join(', ')}</span>
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          {(food.tags || []).slice(0, 2).map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Name */}
                        <h3 className="font-bold text-slate-900 line-clamp-2 leading-snug flex-1">{food.name}</h3>

                        {/* Rating & Stock */}
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                          <span className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star size={13} fill="currentColor" /> {food.rating ? food.rating.toFixed(1) : '5.0'}
                            <span className="text-slate-400 font-normal">({food.reviewCount || 0})</span>
                          </span>
                          <span>Còn: {availableQuantity} phần</span>
                        </div>

                        {/* Price & Add button */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
                          <p className="text-lg font-black text-orange-600 font-mono">
                            {(food.price || 0).toLocaleString('vi-VN')} đ
                          </p>

                          <Button
                            size="sm"
                            disabled={!inStock}
                            className="rounded-xl w-10 h-10 p-0 min-h-[40px] z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              addItem(
                                {
                                  id: food._id,
                                  name: food.name,
                                  price: food.price,
                                  image: food.images?.[0],
                                  calories: food.calories,
                                },
                                1
                              );
                            }}
                            aria-label={`Thêm ${food.name} vào giỏ hàng`}
                          >
                            <Plus size={18} />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                );
              })}
            </div>

            {/* Phân trang */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 py-8">
                <Button
                  variant="outline"
                  className="rounded-full w-10 h-10 p-0 disabled:opacity-40 min-h-[40px]"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Trang trước"
                >
                  <ChevronLeft size={18} />
                </Button>

                <span className="text-sm font-bold text-slate-700">
                  Trang {page} / {totalPages} ({totalItems} món)
                </span>

                <Button
                  variant="outline"
                  className="rounded-full w-10 h-10 p-0 disabled:opacity-40 min-h-[40px]"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Trang sau"
                >
                  <ChevronRight size={18} />
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
