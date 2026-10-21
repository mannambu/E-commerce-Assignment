import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin,
  CreditCard,
  Truck,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Wallet,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Navbar from '@/components/layout/Navbar';
import { cn } from '@/lib/utils';
import { getVietnamLocalDate, getVietnamLocalDateWithOffset } from '@/lib/date';
import { useCart } from '@/context/CartContext';
import { useAuth, UserAddress } from '@/context/AuthContext';
import api from '@/services/api';

export default function Checkout() {
  const navigate = useNavigate();
  const { subtotal, cartType, items, fetchCart } = useCart();
  const { user } = useAuth();

  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'vnpay' | 'momo'>('cod');
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quoteIssues, setQuoteIssues] = useState<string[]>([]);
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [cartVersion, setCartVersion] = useState<number | null>(null);
  const [quotedSubtotal, setQuotedSubtotal] = useState<number | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const checkoutAttempt = useRef<{ signature: string; key: string } | null>(null);
  const [shippingStatus, setShippingStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [fullName, setFullName] = useState(user?.username || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('custom');

  const [deliveryDate, setDeliveryDate] = useState(() => getVietnamLocalDateWithOffset(1));
  const [note, setNote] = useState('');

  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    phone?: string;
    address?: string;
    deliveryDate?: string;
  }>({});

  const minDeliveryDate = getVietnamLocalDate();

  const paymentMap: Record<string, 'COD' | 'VNPay' | 'MoMo'> = {
    cod: 'COD',
    vnpay: 'VNPay',
    momo: 'MoMo'
  };

  // Auto-fill from user profile
  useEffect(() => {
    if (user) {
      if (!fullName && user.username) setFullName(user.username);
      if (!phone && user.phone) setPhone(user.phone);

      const savedAddresses: UserAddress[] = Array.isArray(user.addresses) ? user.addresses : [];
      if (savedAddresses.length > 0 && !address) {
        const defaultAddr = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
        setAddress(defaultAddr.address || defaultAddr.fullAddress || '');
        setSelectedAddressId(defaultAddr._id || defaultAddr.id || 'custom');
      }
    }
  }, [user]);

  // Handle Saved Address Selection
  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'custom') {
      setAddress('');
      return;
    }
    const saved = user?.addresses?.find((a) => (a._id || a.id) === addrId);
    if (saved) {
      setAddress(saved.address || saved.fullAddress || '');
      if (fieldErrors.address) {
        setFieldErrors((prev) => ({ ...prev, address: undefined }));
      }
    }
  };

  // Đồng bộ ngày giao nếu giỏ hàng đã có lịch giao cụ thể (ví dụ gói tuần COMBO hoặc gợi ý thực đơn)
  useEffect(() => {
    const datesInCart = items
      .map((i) => i.deliveryDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    if (datesInCart.length > 0 && datesInCart[0] !== deliveryDate) {
      setDeliveryDate(datesInCart[0]);
    }
  }, [items]);

  // Quote pricing
  useEffect(() => {
    setCartVersion(null);
    setQuotedSubtotal(null);
    setQuotedTotal(null);
    setQuoteIssues([]);
    const trimmedAddress = address.trim();

    if (!trimmedAddress || !deliveryDate || deliveryDate < minDeliveryDate) {
      setShippingFee(null);
      setShippingStatus('idle');
      return;
    }

    let isActive = true;
    setShippingStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const response = await api.post('/orders/quote', {
          deliveryAddress: trimmedAddress,
          deliveryDate,
          deliveryTime: '12:00',
          packageType: cartType === 'COMBO' ? 'WEEKLY_7D' : 'ONE_DAY',
          cartType: cartType || 'FOOD',
          paymentMethod: paymentMap[paymentMethod] || 'COD'
        });

        if (!isActive) return;

        const result = response?.data?.result;
        const fee = result?.pricing?.shippingFee;
        const version = result?.cart?.version;
        const pricing = result?.pricing;

        if (Array.isArray(result?.issues) && result.issues.length > 0) {
          setQuoteIssues(result.issues.map((i: any) => i.message || String(i)));
        }

        if (typeof fee === 'number' && Number.isFinite(fee) && Number.isSafeInteger(version)) {
          setShippingFee(fee);
          setCartVersion(version);
          setQuotedSubtotal(pricing.subtotal);
          setQuotedTotal(pricing.grandTotal);
          setShippingStatus('ready');
        } else {
          setShippingFee(null);
          setShippingStatus('error');
        }
      } catch (err: any) {
        if (!isActive) return;
        setShippingFee(null);
        setShippingStatus('error');
        setErrorMessage(err?.response?.data?.message || 'Không thể tính phí vận chuyển cho địa chỉ này.');
      }
    }, 600);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [address, deliveryDate, minDeliveryDate, paymentMethod, cartType, quoteRevision]);

  const handleCheckout = async () => {
    if (isProcessing || showSuccess) return;

    if (paymentMethod !== 'cod') {
      setErrorMessage('Hiện tại FitBite chỉ hỗ trợ thanh toán khi nhận hàng (COD). Vui lòng chọn COD để đặt hàng.');
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
      nextErrors.phone = 'Số điện thoại không hợp lệ (10 chữ số).';
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
      setErrorMessage('Vui lòng kiểm tra lại các thông tin giao hàng còn thiếu.');
      return;
    }

    if (cartVersion === null || shippingStatus !== 'ready') {
      setErrorMessage('Đang tính toán cước phí và kho hàng. Vui lòng chờ vài giây.');
      return;
    }

    try {
      setErrorMessage(null);
      setIsProcessing(true);

      const payload = {
        deliveryAddress: trimmedAddress,
        deliveryDate,
        deliveryTime: '12:00',
        packageType: cartType === 'COMBO' ? 'WEEKLY_7D' : 'ONE_DAY',
        cartType: cartType || 'FOOD',
        paymentMethod: paymentMap[paymentMethod] || 'COD',
        note: [trimmedName, trimmedPhone, note.trim()].filter(Boolean).join(' | '),
        cartVersion
      };

      const signature = JSON.stringify(payload);
      if (checkoutAttempt.current?.signature !== signature) {
        checkoutAttempt.current = { signature, key: crypto.randomUUID() };
      }

      const response = await api.post('/orders', {
        ...payload,
        idempotencyKey: checkoutAttempt.current.key
      });

      const orderResult = response.data.result;
      setCreatedOrderId(orderResult._id || orderResult.id || null);
      setQuotedSubtotal(orderResult.subtotal);
      setQuotedTotal(orderResult.grandTotal);
      setShippingFee(orderResult.shippingFee);

      await fetchCart();
      setIsProcessing(false);
      setShowSuccess(true);
    } catch (error: any) {
      setIsProcessing(false);
      setErrorMessage(error?.response?.data?.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
      if ([400, 409, 422].includes(error?.response?.status)) {
        setQuoteRevision((value) => value + 1);
      }
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

  const totalAmount = quotedTotal;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link
          to="/cart"
          className="inline-flex items-center text-gray-500 hover:text-orange-500 transition-colors font-medium text-sm"
        >
          <ArrowLeft size={18} className="mr-2" /> Quay lại giỏ hàng
        </Link>

        {quoteIssues.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-sm space-y-1">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-600" /> Cảnh báo tồn kho / Báo giá:
            </p>
            <ul className="list-disc list-inside pl-2">
              {quoteIssues.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Shipping Forms */}
          <div className="lg:col-span-2 space-y-8">
            {/* Shipping Information Section */}
            <section className="bg-white p-8 rounded-[32px] shadow-xs border border-gray-100 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <MapPin size={24} className="text-orange-500" /> Thông tin giao hàng
                </h2>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full flex items-center gap-1">
                  <Sparkles size={12} /> Ca trưa 12:00
                </span>
              </div>

              {/* Saved Address Book Quick Picker */}
              {user?.addresses && user.addresses.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase tracking-wide">
                    <BookOpen size={14} className="text-orange-500" /> Sổ địa chỉ đã lưu
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {user.addresses.map((addr) => {
                      const addrId = addr._id || addr.id || '';
                      const isSelected = selectedAddressId === addrId;
                      return (
                        <button
                          key={addrId}
                          type="button"
                          onClick={() => handleSelectSavedAddress(addrId)}
                          className={cn(
                            'p-3.5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between',
                            isSelected
                              ? 'border-orange-500 bg-orange-50/50 shadow-xs'
                              : 'border-gray-100 bg-gray-50/40 hover:border-gray-200'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-gray-900">{addr.name || addr.label || 'Địa chỉ'}</span>
                            {addr.isDefault && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-md">
                                Mặc định
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2 mt-1">{addr.address || addr.fullAddress}</p>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress('custom')}
                      className={cn(
                        'p-3.5 rounded-2xl text-left border-2 border-dashed transition-all flex items-center justify-center font-bold text-xs',
                        selectedAddressId === 'custom'
                          ? 'border-orange-500 bg-orange-50/50 text-orange-600'
                          : 'border-gray-200 text-gray-500 hover:border-orange-300'
                      )}
                    >
                      + Nhập địa chỉ khác
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Họ và tên người nhận"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={fullName}
                  error={fieldErrors.fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                  }}
                />

                <Input
                  label="Số điện thoại liên hệ"
                  placeholder="Ví dụ: 0901234567"
                  value={phone}
                  error={fieldErrors.phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                />

                <div>
                  <Input
                    label="Ngày bắt đầu nhận hàng"
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
                  <p className="text-[11px] text-gray-400 mt-1">
                    Giao hàng khung giờ trưa (12:00) các ngày theo gói của bạn.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <Input
                    label="Địa chỉ chi tiết nhận hàng"
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện, TP.HCM"
                    value={address}
                    error={fieldErrors.address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setSelectedAddressId('custom');
                      if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: undefined }));
                    }}
                  />
                </div>

                <div className="md:col-span-2">
                  <Input
                    label="Ghi chú giao hàng (nếu có)"
                    placeholder="Ví dụ: Giao sảnh tòa nhà, gửi bảo vệ, gọi trước khi giao..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Payment Methods */}
            <section className="bg-white p-8 rounded-[32px] shadow-xs border border-gray-100 space-y-6">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <CreditCard size={24} className="text-orange-500" /> Phương thức thanh toán
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    id: 'cod' as const,
                    name: 'Tiền mặt khi nhận (COD)',
                    sub: 'Khuyên dùng cho đơn hàng',
                    icon: <Truck className="text-emerald-500" size={24} />,
                    active: true
                  },
                  {
                    id: 'vnpay' as const,
                    name: 'VNPay QR / Thẻ',
                    sub: 'Đang bảo trì / Nâng cấp',
                    icon: <Wallet className="text-blue-500" size={24} />,
                    active: false
                  },
                  {
                    id: 'momo' as const,
                    name: 'Ví điện tử MoMo',
                    sub: 'Đang bảo trì / Nâng cấp',
                    icon: <Wallet className="text-pink-500" size={24} />,
                    active: false
                  }
                ].map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => {
                      if (!method.active) {
                        setErrorMessage('Chức năng thanh toán qua VNPay/MoMo đang nâng cấp. Vui lòng chọn COD (Tiền mặt).');
                        return;
                      }
                      setPaymentMethod(method.id);
                      setErrorMessage(null);
                    }}
                    className={cn(
                      'p-5 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-2 relative',
                      paymentMethod === method.id
                        ? 'border-orange-500 bg-orange-50/60 shadow-xs'
                        : 'border-gray-100 bg-white hover:border-orange-200',
                      !method.active && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center border border-gray-100">
                      {method.icon}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">{method.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{method.sub}</p>
                    </div>

                    {paymentMethod === method.id && (
                      <CheckCircle2 size={18} className="text-orange-500 absolute top-3 right-3" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right: Order Summary */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[32px] shadow-xs border border-gray-100 space-y-6 sticky top-24">
              <h3 className="text-xl font-bold text-gray-900">Tóm tắt đơn hàng</h3>

              <div className="space-y-3.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính tiền món</span>
                  <span className="font-bold text-gray-900">
                    {(quotedSubtotal ?? subtotal).toLocaleString('vi-VN')}đ
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Phí giao hàng</span>
                  <span
                    className={cn(
                      'font-bold',
                      shippingStatus === 'loading'
                        ? 'text-orange-500 animate-pulse'
                        : shippingStatus === 'error'
                          ? 'text-red-500'
                          : 'text-gray-900'
                    )}
                  >
                    {shippingFeeDisplay}
                  </span>
                </div>

                <div className="flex justify-between items-baseline text-2xl pt-4 border-t border-gray-100">
                  <span className="font-bold text-gray-900 text-base">Tổng thanh toán</span>
                  <span className="font-black text-orange-500 text-2xl">
                    {totalAmount !== null ? `${totalAmount.toLocaleString('vi-VN')}đ` : '--'}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-start gap-3">
                <ShieldCheck size={20} className="text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-800 leading-relaxed">
                  Đơn hàng được chuẩn bị bởi đầu bếp chuyên nghiệp, nguyên liệu đạt chuẩn ATVSTP và kiểm định calo.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 rounded-2xl border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button
                className="w-full h-14 text-base font-bold rounded-2xl shadow-lg shadow-orange-200"
                onClick={handleCheckout}
                disabled={isProcessing || showSuccess || shippingStatus !== 'ready' || cartVersion === null}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <RotateCcw size={18} className="animate-spin" /> Đang tạo đơn...
                  </span>
                ) : (
                  'Xác nhận đặt hàng ngay'
                )}
              </Button>

              <p className="text-center text-[10px] text-gray-400 font-medium">
                Bằng việc nhấn Đặt hàng, bạn đồng ý với Điều khoản dịch vụ & Chính sách của FitBite.
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
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[40px] p-8 sm:p-10 max-w-md w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={48} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-gray-900">Đặt hàng thành công!</h2>
                {createdOrderId && (
                  <p className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full inline-block border border-orange-200">
                    Mã đơn hàng: #{createdOrderId.slice(-8).toUpperCase()}
                  </p>
                )}
                <p className="text-gray-500 text-sm leading-relaxed">
                  Cảm ơn bạn đã lựa chọn FitBite! Bếp ăn đang bắt đầu chuẩn bị bữa ăn dinh dưỡng cho bạn.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  className="w-full h-13 rounded-2xl text-base font-bold shadow-md shadow-orange-200"
                  onClick={() => navigate('/dashboard/user')}
                >
                  Theo dõi đơn hàng tại Dashboard
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-2xl text-sm"
                  onClick={() => navigate('/food-catalog')}
                >
                  Tiếp tục xem thực đơn
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
