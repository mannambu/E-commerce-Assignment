import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Flame, CreditCard, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import Navbar from '@/components/layout/Navbar';
import { useCart } from '@/context/CartContext';

export default function Cart() {
  const { items, updateQty, removeItem, subtotal } = useCart();

  const totalCalories = items.reduce((acc, item) => acc + (item.calories || 0) * item.qty, 0);

  const shippingFee: number | null = null;
  const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')}đ`;
  const formatTotal = (base: number, fee: number | null) =>
    formatCurrency(base + (typeof fee === 'number' ? fee : 0));
  const shippingFeeLabel = typeof shippingFee === 'number' ? formatCurrency(shippingFee) : 'Chưa tính';
  const totalLabel = typeof shippingFee === 'number' ? 'Tổng cộng' : 'Tổng cộng (tạm tính)';
  const totalValue = formatTotal(subtotal, shippingFee);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
            <ShoppingBag size={48} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Giỏ hàng trống</h2>
            <p className="text-gray-500">Hãy chọn những món ăn dinh dưỡng cho hôm nay nhé!</p>
          </div>
          <Link to="/food-catalog">
            <Button className="rounded-2xl px-8">Khám phá thực đơn</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Giỏ hàng của bạn</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Items List */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence>
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4"
                >
                  <img 
                    src={item.image} 
                    alt={item.name} 
                    className="w-20 h-20 rounded-2xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm font-bold text-orange-500">{item.price.toLocaleString('vi-VN')}đ</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Flame size={12} /> {item.calories} kcal
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-xl">
                    <button 
                      onClick={() => updateQty(item.id, -1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-orange-500 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-4 text-center font-bold text-sm">{item.qty}</span>
                    <button 
                      onClick={() => updateQty(item.id, 1)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-orange-500 transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => removeItem(item.id)}
                    className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={20} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Summary */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
              <h3 className="text-xl font-bold text-gray-900">Tổng kết đơn hàng</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính</span>
                  <span className="font-bold text-gray-900">{subtotal.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Phí giao hàng</span>
                  <span className="font-bold text-gray-900">{shippingFeeLabel}</span>
                </div>
                <div className="flex justify-between text-sm pt-4 border-t border-gray-50">
                  <span className="text-gray-500">Tổng Calo</span>
                  <span className="font-bold text-orange-500 flex items-center gap-1">
                    <Flame size={16} /> {totalCalories} kcal
                  </span>
                </div>
                <div className="flex justify-between text-xl pt-4 border-t border-gray-100">
                  <span className="font-bold text-gray-900">{totalLabel}</span>
                  <span className="font-black text-orange-500">{totalValue}</span>
                </div>
                {shippingFee === null && (
                  <p className="text-xs text-gray-400">
                    Phí giao hàng sẽ được tính ở bước thanh toán.
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <Truck size={20} className="text-gray-400" />
                  <div className="text-xs">
                    <p className="font-bold text-gray-900">Giao hàng nhanh</p>
                    <p className="text-gray-500">Dự kiến: 30 - 45 phút</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <CreditCard size={20} className="text-gray-400" />
                  <div className="text-xs">
                    <p className="font-bold text-gray-900">Thanh toán linh hoạt</p>
                    <p className="text-gray-500">COD, VNPay, MoMo</p>
                  </div>
                </div>
              </div>

              <Link to="/checkout">
                <Button className="w-full h-14 text-lg rounded-2xl shadow-lg shadow-orange-200">
                  Thanh toán ngay <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
