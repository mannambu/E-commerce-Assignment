import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, SlidersHorizontal, Plus, Flame, ShoppingCart, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { useCart } from '@/context/CartContext';
import api from '@/services/api';

const categories = ['Tất cả', 'Giảm cân', 'Tăng cơ', 'Ăn chay', 'Ít tinh bột'];

// Map các Category tiếng Việt với Tags tiếng Anh từ Backend
const categoryToTagsMap: Record<string, string[]> = {
  'Giảm cân': ['LowCalorie', 'LowFat'],
  'Tăng cơ': ['HighProtein'],
  'Ăn chay': ['Vegan'],
  'Ít tinh bột': ['GlutenFree']
};

export default function UserMenu() {
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'priceAsc' | 'priceDesc' | 'caloriesAsc' | 'caloriesDesc' | 'nameAsc'>('default');
  
  // State tìm kiếm
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // State dữ liệu & phân trang
  const [foodItems, setFoodItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const filterRef = useRef<HTMLDivElement | null>(null);
  
  const { addItem, items } = useCart();

  // Debounce (Trì hoãn) việc tìm kiếm: Giúp người dùng gõ xong (ngừng 0.5s) mới gọi API
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Đóng menu lọc khi click ra ngoài
  useEffect(() => {
    if (!isFilterOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!filterRef.current) return;
      if (!filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFilterOpen]);

  // Bất cứ khi nào đổi Từ khóa tìm kiếm hoặc Danh mục -> Trở về trang 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeCategory]);

  // Gọi API lấy danh sách món ăn từ Backend (Có Phân trang & Lọc)
  useEffect(() => {
    const fetchFoods = async () => {
      try {
        setIsLoading(true);
        
        // Khởi tạo URLSearchParams để ghép params cho gọn gàng
        const params = new URLSearchParams();
        params.append('page', page.toString());
        params.append('limit', '12'); // Dùng 12 item để giao diện chia lưới được đẹp (3 hoặc 4 cột)

        // Nếu có từ khóa tìm kiếm
        if (debouncedSearch.trim()) {
          params.append('search', debouncedSearch.trim());
        }

        // Nếu có lọc theo danh mục
        if (activeCategory !== 'Tất cả') {
          const tags = categoryToTagsMap[activeCategory];
          if (tags && tags.length > 0) {
            params.append('tags', tags.join(',')); // BE yêu cầu phân cách bằng dấu phẩy
          }
        }

        const res = await api.get(`/foods?${params.toString()}`);
        
        const result = res.data.result;
        setFoodItems(result.foods || []);
        // Cập nhật tổng số trang dựa vào BE trả về
        setTotalPages(result.pagination?.total_pages || 1);
        
      } catch (error) {
        console.error("Lỗi tải thực đơn:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFoods();
  }, [page, debouncedSearch, activeCategory]);

  const displayedFoods = useMemo(() => {
    const clonedFoods = [...foodItems];

    switch (sortBy) {
      case 'priceAsc':
        return clonedFoods.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      case 'priceDesc':
        return clonedFoods.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      case 'caloriesAsc':
        return clonedFoods.sort((a, b) => Number(a.calories || 0) - Number(b.calories || 0));
      case 'caloriesDesc':
        return clonedFoods.sort((a, b) => Number(b.calories || 0) - Number(a.calories || 0));
      case 'nameAsc':
        return clonedFoods.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
      default:
        return clonedFoods;
    }
  }, [foodItems, sortBy]);

  return (
    <div className="flex h-screen role-page-shell overflow-hidden">
      <Sidebar role="user" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Thực đơn hôm nay" userRole="Người dùng" />
        <main className="flex-1 overflow-y-auto p-8 relative">
          
          {/* Header & Search */}
          <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
            Mẹo: bấm vào từng món, kéo xuống cuối trang chi tiết sẽ thấy khối Đánh giá món ăn.
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={20}
                />
                <Input
                  type="text"
                  placeholder="Tìm kiếm món ăn..."
                  className="pl-10 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative" ref={filterRef}>
                <Button
                  variant="outline"
                  className={cn(
                    'rounded-xl aspect-square p-0 w-10 h-10',
                    sortBy !== 'default' && 'border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100'
                  )}
                  onClick={() => setIsFilterOpen((prev) => !prev)}
                >
                  <SlidersHorizontal size={20} />
                </Button>

                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 z-30 w-64 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl">
                    <p className="px-3 py-2 text-[11px] font-black tracking-widest text-gray-400 uppercase">Sắp xếp nhanh</p>

                    {[
                      { key: 'default', label: 'Mặc định' },
                      { key: 'priceAsc', label: 'Giá: thấp đến cao' },
                      { key: 'priceDesc', label: 'Giá: cao đến thấp' },
                      { key: 'caloriesAsc', label: 'Calories: thấp đến cao' },
                      { key: 'caloriesDesc', label: 'Calories: cao đến thấp' },
                      { key: 'nameAsc', label: 'Tên món: A - Z' }
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setSortBy(option.key as typeof sortBy);
                          setIsFilterOpen(false);
                        }}
                        className={cn(
                          'w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                          sortBy === option.key
                            ? 'bg-orange-50 text-orange-600'
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="flex overflow-x-auto pb-4 mb-8 gap-2 no-scrollbar">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all',
                  activeCategory === category
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                    : 'bg-white text-gray-500 hover:bg-gray-100'
                )}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Hiển thị Loading hoặc Dữ liệu */}
          {isLoading ? (
            <div className="text-center py-20 font-bold text-gray-500">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              Đang tải danh sách món ăn...
            </div>
          ) : (
            <>
              {/* Product Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {displayedFoods.map((food, index) => (
                  <Link to={`/food/${food._id}`} key={food._id}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white rounded-[24px] overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group border border-gray-100 flex flex-col h-full"
                    >
                      <div className="aspect-[4/3] relative overflow-hidden bg-gray-100">
                        <img
                          src={food.images?.[0] || 'https://picsum.photos/seed/food/400/300'}
                          alt={food.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
                          <Flame size={14} className="text-orange-500" />
                          <span className="text-xs font-bold text-gray-700">
                            {food.calories || 0} kcal
                          </span>
                        </div>
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex flex-wrap gap-1 mb-3">
                          {food.tags?.slice(0, 3).map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[10px] font-bold uppercase tracking-wider text-orange-500 bg-orange-50 px-2 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <h3 className="font-bold text-gray-900 line-clamp-2 mb-4 flex-1">
                          {food.name}
                        </h3>
                        <div className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg w-fit">
                          <Star size={12} className="fill-blue-600" /> Mở chi tiết để đánh giá món
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          <p className="text-lg font-black text-orange-500">
                            {(food.price || 0).toLocaleString('vi-VN')}đ
                          </p>
                          <Button
                            size="sm"
                            className="rounded-xl w-10 h-10 p-0 relative z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              addItem({
                                id: food._id,
                                name: food.name,
                                price: food.price,
                                image: food.images?.[0] || 'https://picsum.photos/seed/food/400/300',
                                calories: food.calories,
                                type: 'food'
                              });
                            }}
                          >
                            <Plus size={20} />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                ))}
              </div>

              {/* Giao diện Rỗng */}
              {displayedFoods.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-400 font-bold">
                    Không tìm thấy món ăn phù hợp...
                  </p>
                </div>
              )}

              {/* Điều khiển Phân trang */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-12 pb-20">
                  <Button
                    variant="outline"
                    className="rounded-full w-10 h-10 p-0 flex items-center justify-center disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft size={20} />
                  </Button>

                  <span className="text-gray-600 font-bold">
                    Trang {page} / {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    className="rounded-full w-10 h-10 p-0 flex items-center justify-center disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight size={20} />
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Nút Giỏ hàng nổi (Floating Cart Button) */}
          {items.length > 0 && (
            <div className="fixed bottom-8 right-8 z-40 animate-in slide-in-from-bottom-4">
              <Link to="/cart">
                <Button className="rounded-full px-8 py-6 h-auto shadow-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-lg flex items-center gap-3">
                  <ShoppingCart size={24} />
                  Thanh toán ({items.length})
                </Button>
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}