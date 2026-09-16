import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MapPin, 
  CreditCard, 
  Truck, 
  ChevronRight, 
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  X
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Navbar from '@/components/layout/Navbar';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import api from '@/services/api';

export default function Checkout() {
  const navigate = useNavigate();
  const { subtotal, fetchCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState('vnpay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [shippingStatus, setShippingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    phone?: string;
    address?: string;
    deliveryDate?: string;
  }>({});
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState('');

  const minDeliveryDate = new Date().toISOString().slice(0, 10);
  const discountAmount = 15000;
  const paymentMap: Record<string, 'COD' | 'VNPay' | 'MoMo'> = {
    cod: 'COD',
    vnpay: 'VNPay',
    momo: 'MoMo'
  };

  useEffect(() => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress || !deliveryDate || deliveryDate < minDeliveryDate) {
      setShippingFee(null);
      setShippingStatus('idle');
      return;
    }

    let isActive = true;
    const timer = setTimeout(async () => {
      setShippingStatus('loading');
      try {
        const response = await api.post('/orders/quote', {
          deliveryAddress: trimmedAddress,
          deliveryDate: `${deliveryDate}T12:00:00.000Z`,
          packageType: 'ONE_DAY',
          cartType: 'FOOD',
          paymentMethod: paymentMap[paymentMethod] || 'COD'
        });

        const fee = response?.data?.result?.pricing?.shippingFee;
        if (!isActive) return;

        if (typeof fee === 'number' && Number.isFinite(fee)) {
          setShippingFee(fee);
          setShippingStatus('ready');
        } else {
          setShippingFee(null);
          setShippingStatus('error');
        }
      } catch {
        if (!isActive) return;
        setShippingFee(null);
        setShippingStatus('error');
      }
    }, 600);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [address, deliveryDate, minDeliveryDate, paymentMethod]);

  const handleCheckout = async () => {
    if (paymentMethod !== 'cod') {
      setErrorMessage('Chức năng thanh toán VNPay/MoMo hiện đang trong quá trình phát triển, vui lòng chọn thanh toán bằng COD.');
      return;
    }
    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();
    const normalizedPhone = trimmedPhone.replace(/\s+/g, '');
    const nextErrors: {
      fullName?: string;
      phone?: string;
      address?: string;
      deliveryDate?: string;
    } = {};

    if (!trimmedName) {
      nextErrors.fullName = 'Vui lòng nhập họ và tên.';
    }

    if (!normalizedPhone) {
      nextErrors.phone = 'Vui lòng nhập số điện thoại.';
    } else if (!/^(0|\+84)\d{9,10}$/.test(normalizedPhone)) {
      nextErrors.phone = 'Số điện thoại không hợp lệ.';
    }

    if (!trimmedAddress) {
      nextErrors.address = 'Vui lòng nhập địa chỉ nhận hàng.';
    }

    if (!deliveryDate) {
      nextErrors.deliveryDate = 'Vui lòng chọn ngày giao hàng.';
    } else if (deliveryDate < minDeliveryDate) {
      nextErrors.deliveryDate = 'Ngày giao hàng không hợp lệ. Vui lòng chọn từ hôm nay trở đi.';
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setErrorMessage('Vui lòng kiểm tra lại thông tin giao hàng.');
      return;
    }

    try {
      setErrorMessage(null);
      setIsProcessing(true);

      await api.post('/orders', {
        deliveryAddress: address.trim(),
        deliveryDate: `${deliveryDate}T12:00:00.000Z`,
        packageType: 'ONE_DAY',
        cartType: 'FOOD',
        paymentMethod: paymentMap[paymentMethod] || 'COD',
        note: [fullName.trim(), phone.trim(), note.trim()].filter(Boolean).join(' | ')
      });

      await fetchCart();
      setIsProcessing(false);
      setShowSuccess(true);
    } catch (error: any) {
      setIsProcessing(false);
      setErrorMessage(error?.response?.data?.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
    }
  };

  const shippingFeeDisplay =
    shippingStatus === 'loading'
      ? 'Đang tính...'
      : shippingStatus === 'error'
        ? 'Không tính được'
        : shippingFee !== null
          ? `${shippingFee.toLocaleString('vi-VN')}đ`
          : 'Chưa tính';
  const totalAmount = shippingFee !== null ? subtotal + shippingFee - discountAmount : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/cart" className="inline-flex items-center text-gray-500 hover:text-orange-500 mb-8 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Quay lại giỏ hàng
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Forms */}
          <div className="lg:col-span-2 space-y-8">
            {/* Shipping Info */}
            <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <MapPin size={24} className="text-orange-500" /> Thông tin giao hàng
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Họ và tên"
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  error={fieldErrors.fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) {
                      setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                    }
                  }}
                />
                <Input
                  label="Số điện thoại"
                  placeholder="0901234567"
                  value={phone}
                  error={fieldErrors.phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }
                  }}
                />
                <div>
                  <Input
                    label="Ngày giao hàng"
                    type="date"
                    value={deliveryDate}
                    min={minDeliveryDate}
                    error={fieldErrors.deliveryDate}
                    onChange={(e) => {
                      setDeliveryDate(e.target.value);
                      if (fieldErrors.deliveryDate) {
                        setFieldErrors((prev) => ({ ...prev, deliveryDate: undefined }));
                      }
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Địa chỉ nhận hàng"
                    placeholder="Số 123, Đường ABC, Quận XYZ, TP. HCM"
                    value={address}
                    error={fieldErrors.address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      if (fieldErrors.address) {
                        setFieldErrors((prev) => ({ ...prev, address: undefined }));
                      }
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Ghi chú đơn hàng"
                    placeholder="Ví dụ: Giao giờ hành chính, không cay..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Payment Methods */}
            <section className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <CreditCard size={24} className="text-orange-500" /> Phương thức thanh toán
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: 'vnpay', name: 'VNPay - ( Đang cập nhật )', icon: <Wallet className="text-blue-500" /> },
                  { id: 'momo', name: 'MoMo - ( Đang cập nhật )', icon: <Wallet className="text-pink-500" /> },
                  { id: 'cod', name: 'Tiền mặt', icon: <Truck className="text-gray-500" /> },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() => {
                      setPaymentMethod(method.id);
                      if (method.id === 'vnpay' || method.id === 'momo') {
                        setErrorMessage('Chức năng thanh toán VNPay/MoMo hiện đang trong quá trình phát triển, vui lòng chọn thanh toán bằng COD.');
                      } else {
                        setErrorMessage(null);
                      }
                    }}
                    className={cn(
                      "p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3",
                      paymentMethod === method.id 
                        ? "border-orange-500 bg-orange-50" 
                        : "border-gray-100 hover:border-orange-200"
                    )}
                  >
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                      {method.icon}
                    </div>
                    <span className="font-bold text-sm">{method.name}</span>
                    {paymentMethod === method.id && (
                      <CheckCircle2 size={16} className="text-orange-500" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right: Order Summary */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 space-y-6 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900">Tóm tắt đơn hàng</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính</span>
                  <span className="font-bold text-gray-900">{subtotal.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Phí giao hàng</span>
                  <span className="font-bold text-gray-900">{shippingFeeDisplay}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Giảm giá</span>
                  <span className="font-bold text-green-500">-{discountAmount.toLocaleString('vi-VN')}đ</span>
                </div>
                <div className="flex justify-between text-2xl pt-4 border-t border-gray-100">
                  <span className="font-bold text-gray-900">Tổng cộng</span>
                  <span className="font-black text-orange-500">
                    {totalAmount !== null ? `${totalAmount.toLocaleString('vi-VN')}đ` : '--'}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-start gap-3">
                <ShieldCheck size={20} className="text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-700 leading-relaxed">
                  Đơn hàng của bạn được bảo vệ bởi chính sách hoàn tiền 100% nếu có sai sót về dinh dưỡng.
                </p>
              </div>

              <Button 
                className="w-full h-14 text-lg rounded-2xl shadow-lg shadow-orange-200"
                onClick={handleCheckout}
                disabled={isProcessing}
              >
                {isProcessing ? 'Đang xử lý...' : 'Xác nhận đặt hàng'}
              </Button>

              {errorMessage ? (
                <p className="text-sm font-medium text-red-500 text-center">{errorMessage}</p>
              ) : null}
              
              <p className="text-center text-[10px] text-gray-400 font-medium">
                Bằng cách đặt hàng, bạn đồng ý với Điều khoản dịch vụ của chúng tôi.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSuccess(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] p-10 max-w-md w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={48} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-gray-900">Đặt hàng thành công!</h2>
                <p className="text-gray-500">Cảm ơn bạn đã tin tưởng FitBite. Đơn hàng của bạn đang được chuẩn bị và sẽ sớm được giao đến.</p>
              </div>
              <Button 
                className="w-full h-14 rounded-2xl text-lg"
                onClick={() => navigate('/dashboard/user')}
              >
                Về Dashboard
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
