import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/services/api';

// Schema Bước 1: Nhập email yêu cầu mã OTP
const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Email không đúng định dạng')
    .min(1, 'Email là bắt buộc'),
});

// Schema Bước 2: Nhập OTP và mật khẩu mới
const resetSchema = z
  .object({
    reset_code: z
      .string()
      .trim()
      .length(6, 'Mã xác nhận gồm đúng 6 chữ số')
      .regex(/^\d{6}$/, 'Mã xác nhận chỉ gồm các chữ số (0-9)'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải từ 8 đến 50 ký tự')
      .max(50, 'Mật khẩu tối đa 50 ký tự')
      .refine(
        (val) => new TextEncoder().encode(val).length <= 72,
        'Mật khẩu vượt quá giới hạn 72 byte UTF-8'
      ),
    confirm_password: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới'),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirm_password'],
  });

type ForgotForm = z.infer<typeof forgotSchema>;
type ResetForm = z.infer<typeof resetSchema>;

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Yêu cầu mã, 2: Nhập mã & đổi mật khẩu, 3: Thành công
  const [targetEmail, setTargetEmail] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const navigate = useNavigate();

  // Form Bước 1
  const {
    register: registerForgot,
    handleSubmit: handleSubmitForgot,
    formState: { errors: errorsForgot, isSubmitting: isSubmittingForgot },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  // Form Bước 2
  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: errorsReset, isSubmitting: isSubmittingReset },
    setError: setErrorReset,
    reset: resetResetForm,
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      reset_code: '',
      password: '',
      confirm_password: '',
    },
  });

  // Đếm ngược 60s cooldown gửi lại mã OTP (FR-AUTH-014)
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Gửi yêu cầu mã OTP (Bước 1)
  const onSubmitForgot = async (data: ForgotForm) => {
    setGeneralError(null);
    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      await api.post('/users/forgot-password', { email: normalizedEmail });

      setTargetEmail(normalizedEmail);
      setStep(2);
      setCooldown(60);
      resetResetForm();
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 503) {
        setGeneralError('Dịch vụ gửi email (SMTP) hiện chưa được cấu hình trên máy chủ. Vui lòng liên hệ Admin.');
      } else {
        setGeneralError(err.response?.data?.message || 'Không thể gửi mã xác nhận. Vui lòng thử lại sau.');
      }
    }
  };

  // Gửi lại mã OTP
  const handleResendCode = async () => {
    if (cooldown > 0 || isResending || !targetEmail) return;
    setIsResending(true);
    setGeneralError(null);

    try {
      await api.post('/users/forgot-password', { email: targetEmail });
      setCooldown(60);
    } catch (err: any) {
      if (err.response?.status === 503) {
        setGeneralError('Dịch vụ email SMTP hiện chưa sẵn sàng.');
      } else {
        setGeneralError(err.response?.data?.message || 'Chưa thể gửi lại mã xác nhận. Vui lòng thử lại.');
      }
    } finally {
      setIsResending(false);
    }
  };

  // Xác nhận mã và Đặt lại mật khẩu (Bước 2)
  const onSubmitReset = async (data: ResetForm) => {
    setGeneralError(null);
    try {
      await api.post('/users/reset-password', {
        email: targetEmail,
        reset_code: data.reset_code.trim(),
        password: data.password,
        confirm_password: data.confirm_password,
      });

      // Xóa mọi token cũ còn lưu ở client
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('userRole');

      setStep(3);
    } catch (err: any) {
      const status = err.response?.status;
      const responseData = err.response?.data;

      if (status === 401) {
        // Sai mã, hết hạn 15 phút, đã dùng hoặc quá 5 lần thử
        setGeneralError(
          responseData?.message ||
            'Mã xác nhận không hợp lệ, đã hết hạn hoặc vượt quá số lần thử. Vui lòng yêu cầu mã mới.'
        );
      } else if (status === 422 && responseData?.errors) {
        if (responseData.errors.reset_code) {
          setErrorReset('reset_code', { message: responseData.errors.reset_code.msg });
        }
        if (responseData.errors.password) {
          setErrorReset('password', { message: responseData.errors.password.msg });
        }
        if (responseData.errors.confirm_password) {
          setErrorReset('confirm_password', { message: responseData.errors.confirm_password.msg });
        }
      } else {
        setGeneralError(responseData?.message || 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100 rounded-full blur-[120px] opacity-50" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-100 rounded-full blur-[120px] opacity-50" />

      <Link
        to="/login"
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors group z-10"
      >
        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </div>
        <span>Quay lại Đăng nhập</span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/90 backdrop-blur-xl rounded-[40px] shadow-2xl shadow-orange-500/5 p-8 sm:p-10 space-y-6 border border-white relative z-10"
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-2xl text-white shadow-lg shadow-orange-500/30 mb-4">
                  <Mail size={26} />
                </div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Quên mật khẩu?</h1>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                  Nhập địa chỉ email đăng ký để nhận mã OTP 6 chữ số đặt lại mật khẩu.
                </p>
              </div>

              {generalError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                  <span>{generalError}</span>
                </div>
              )}

              <form onSubmit={handleSubmitForgot(onSubmitForgot)} className="space-y-5">
                <Input
                  label="Email tài khoản"
                  type="email"
                  placeholder="Nhập địa chỉ email của bạn"
                  icon={<Mail size={18} />}
                  error={errorsForgot.email?.message}
                  disabled={isSubmittingForgot}
                  {...registerForgot('email')}
                />

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold rounded-2xl shadow-lg shadow-orange-500/25 min-h-[44px]"
                  disabled={isSubmittingForgot}
                >
                  {isSubmittingForgot ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={18} />
                      <span>Đang gửi mã xác nhận...</span>
                    </span>
                  ) : (
                    'Gửi mã xác nhận'
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl text-white shadow-lg shadow-orange-500/30 mb-4">
                  <KeyRound size={26} />
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Đặt lại mật khẩu</h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Mã xác nhận 6 chữ số đã được gửi tới email:
                </p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded-full text-orange-800 text-xs font-bold">
                  <span>{targetEmail}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setGeneralError(null);
                    }}
                    className="text-orange-600 underline hover:text-orange-800 ml-1"
                  >
                    Đổi email
                  </button>
                </div>
              </div>

              {generalError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
                  <div className="flex-1">
                    <p>{generalError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(1);
                        setGeneralError(null);
                      }}
                      className="mt-2 text-xs font-bold text-red-800 underline flex items-center gap-1"
                    >
                      <RotateCcw size={12} /> Yêu cầu mã mới
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitReset(onSubmitReset)} className="space-y-4">
                <div>
                  <Input
                    label="Mã xác nhận (6 chữ số)"
                    placeholder="Ví dụ: 012345"
                    icon={<KeyRound size={18} />}
                    maxLength={6}
                    error={errorsReset.reset_code?.message}
                    disabled={isSubmittingReset}
                    className="font-mono text-center tracking-widest text-lg font-bold"
                    {...registerReset('reset_code')}
                  />
                  <div className="flex justify-between items-center mt-2 px-1 text-xs">
                    <span className="text-gray-400">Hiệu lực 15 phút (tối đa 5 lần thử)</span>
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={cooldown > 0 || isResending}
                      className="font-bold text-orange-600 disabled:text-gray-400 hover:underline flex items-center gap-1"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="animate-spin" size={12} /> Đang gửi...
                        </>
                      ) : cooldown > 0 ? (
                        <>
                          <Clock size={12} /> Gửi lại sau {cooldown}s
                        </>
                      ) : (
                        'Gửi lại mã'
                      )}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <Input
                    label="Mật khẩu mới"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Tối thiểu 8 ký tự (tối đa 50 ký tự)"
                    icon={<Lock size={18} />}
                    error={errorsReset.password?.message}
                    disabled={isSubmittingReset}
                    {...registerReset('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-10 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="relative">
                  <Input
                    label="Xác nhận mật khẩu mới"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Nhập lại chính xác mật khẩu mới"
                    icon={<Lock size={18} />}
                    error={errorsReset.confirm_password?.message}
                    disabled={isSubmittingReset}
                    {...registerReset('confirm_password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-10 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold rounded-2xl shadow-lg shadow-orange-500/25 mt-4 min-h-[44px]"
                  disabled={isSubmittingReset}
                >
                  {isSubmittingReset ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={18} />
                      <span>Đang cập nhật mật khẩu...</span>
                    </span>
                  ) : (
                    'Cập nhật mật khẩu mới'
                  )}
                </Button>
              </form>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6 py-4"
            >
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={44} />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-gray-900 tracking-tight">Đặt lại mật khẩu thành công!</h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Mật khẩu tài khoản của bạn đã được cập nhật thành công. Toàn bộ phiên đăng nhập cũ trên các thiết bị đã được thu hồi an toàn.
                </p>
              </div>
              <Button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full h-12 text-base font-bold rounded-2xl shadow-lg shadow-orange-500/25 min-h-[44px]"
              >
                Quay lại Đăng nhập ngay
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center pt-2 border-t border-gray-100">
          <Link to="/login" className="text-sm font-bold text-orange-600 hover:underline">
            Quay lại trang Đăng nhập
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
