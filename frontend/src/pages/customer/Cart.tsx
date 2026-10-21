import { motion, AnimatePresence } from 'motion/react';
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Flame,
  CreditCard,
  Truck,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/layout/Navbar';
import { useCart } from '@/context/CartContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function Cart() {
  const {
    items,
    updateQty,
    removeItem,
    clearCart,
    subtotal,
    totalCalories,
    cartType,
    canCheckout,
    issues,
    loading,
    fetchCart
  } = useCart();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchCart();
    setIsRefreshing(false);
  };

  // 1. Loading State
  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="pt-32 text-center font-bold text-gray-500 flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 font-semibold">Đang tải giỏ hàng của bạn...</p>
        </div>
      </div>
    );
  }

  // 2. Empty State
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-24 h-24 bg-orange-100/60 rounded-full flex items-center justify-center mx-auto text-orange-500 shadow-inner">
            <ShoppingBag size={48} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-gray-900">Giỏ hàng của bạn đang trống</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Hãy chọn những món ăn healthy được tính toán calo chuẩn xác để bắt đầu ngày mới tràn đầy năng lượng!
            </p>
          </div>
          <div className="flex justify-center gap-4 pt-2">
            <Link to="/food-catalog">
              <Button className="rounded-2xl px-8 h-12 shadow-lg shadow-orange-200">
                Khám phá thực đơn ngay
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header & Cart Type Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Giỏ hàng của bạn</h1>
            <p className="text-sm text-gray-500 mt-1">
              Bạn đang có {items.length} món trong giỏ hàng
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border',
                cartType === 'COMBO'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              )}
            >
              <Sparkles size={14} />
              {cartType === 'COMBO' ? 'Gói Combo tuần (7 ngày)' : 'Đơn món lẻ (1 ngày)'}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-xl text-xs h-9"
            >
              <RotateCcw size={14} className={cn('mr-1.5', isRefreshing && 'animate-spin')} />
              Làm mới
            </Button>
          </div>
        </div>

        {/* Cart Issues Alert Banner */}
        {issues && issues.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 space-y-2 shadow-xs"
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              <ShieldAlert size={20} className="text-amber-600" />
              <span>Một số vấn đề cần lưu ý trong giỏ hàng:</span>
            </div>
            <ul className="list-disc list-inside text-xs sm:text-sm pl-2 space-y-1">
              {issues.map((iss, idx) => (
                <li key={idx} className="font-medium text-amber-800">
                  {iss.message}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Items List */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence>
              {items.map((item) => {
                const lineId = item._id || (item as any).id;
                const itemName = item.itemName || (item as any).name;
                const unitPrice = item.unitPrice ?? (item as any).price ?? 0;
                const unitCalories = item.unitCalories ?? (item as any).calories ?? 0;
                const quantity = item.quantity ?? (item as any).qty ?? 1;
                const lineTotal = item.lineTotal ?? unitPrice * quantity;
                const hasAllergyMatch = item.allergyWarning?.hasMatch;

                return (
                  <motion.div
                    key={lineId}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    className="bg-white p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-4"
                  >
                    <img
                      src={item.image || 'https://picsum.photos/seed/food/200/200'}
                      alt={itemName}
                      className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-gray-100"
                      referrerPolicy="no-referrer"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 text-base">{itemName}</h3>
                        {hasAllergyMatch && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[11px] font-bold rounded-md flex items-center gap-1 border border-red-200">
                            <AlertTriangle size={12} /> Trùng dị ứng
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="font-bold text-orange-600 text-sm">
                          {unitPrice.toLocaleString('vi-VN')}đ
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-semibold text-gray-500">
                          <Flame size={13} className="text-orange-500" />
                          {unitCalories} kcal / phần
                        </span>
                        {item.deliveryDate && (
                          <>
                            <span>•</span>
                            <span className="text-gray-400">
                              Ngày: {new Date(item.deliveryDate).toLocaleDateString('vi-VN')}
                            </span>
                          </>
                        )}
                      </div>

                      <p className="text-xs font-black text-gray-800 pt-0.5">
                        Thành tiền: {lineTotal.toLocaleString('vi-VN')}đ
                      </p>
                    </div>

                    <div className="flex items-center justify-between w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-2xl">
                        <button
                          type="button"
                          onClick={() => updateQty(lineId, -1)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-xs text-gray-600 hover:text-orange-500 transition-colors"
                        >
                          <Minus size={15} />
                        </button>
                        <span className="w-6 text-center font-black text-sm">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(lineId, 1)}
                          className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-xs text-gray-600 hover:text-orange-500 transition-colors"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      {/* Remove Line Item */}
                      <button
                        type="button"
                        onClick={() => removeItem(lineId)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50"
                        title="Xóa món này"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
                className="rounded-xl text-xs text-gray-500 hover:text-red-600 hover:border-red-200"
              >
                <Trash2 size={14} className="mr-1.5" /> Xóa tất cả món
              </Button>
            </div>
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-xs border border-gray-100 space-y-6 sticky top-24">
              <h3 className="text-xl font-black text-gray-900">Tổng kết đơn hàng</h3>

              <div className="space-y-3.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính tiền món</span>
                  <span className="font-bold text-gray-900">{subtotal.toLocaleString('vi-VN')}đ</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Phí giao hàng</span>
                  <span className="font-semibold text-gray-600">Tính ở bước thanh toán</span>
                </div>

                <div className="flex justify-between text-sm pt-3 border-t border-gray-100">
                  <span className="text-gray-500">Tổng năng lượng</span>
                  <span className="font-black text-orange-500 flex items-center gap-1">
                    <Flame size={16} /> {totalCalories.toLocaleString('vi-VN')} kcal
                  </span>
                </div>

                <div className="flex justify-between items-baseline text-2xl pt-4 border-t border-gray-200">
                  <span className="font-bold text-gray-900 text-base">Tạm tính</span>
                  <span className="font-black text-orange-500 text-2xl">
                    {subtotal.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              {/* Delivery & Payment Badges */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <Truck size={20} className="text-orange-500 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-gray-900">Giao bữa đúng giờ</p>
                    <p className="text-gray-500">Hỗ trợ giao ca trưa 12:00 nóng hổi</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <CreditCard size={20} className="text-emerald-500 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-gray-900">Thanh toán an toàn</p>
                    <p className="text-gray-500">Tiền mặt khi nhận hàng (COD)</p>
                  </div>
                </div>
              </div>

              {/* Checkout Action Button */}
              {canCheckout ? (
                <Link to="/checkout" className="block">
                  <Button className="w-full h-14 text-base font-bold rounded-2xl shadow-lg shadow-orange-200">
                    Tiến hành thanh toán <ArrowRight size={20} className="ml-2" />
                  </Button>
                </Link>
              ) : (
                <div className="space-y-2">
                  <Button
                    disabled
                    className="w-full h-14 text-base font-bold rounded-2xl bg-gray-300 text-gray-500 cursor-not-allowed"
                  >
                    <AlertTriangle size={20} className="mr-2" /> Không thể thanh toán
                  </Button>
                  <p className="text-xs text-red-500 text-center font-medium">
                    Vui lòng xử lý các vấn đề trên giỏ hàng trước khi đặt hàng.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
