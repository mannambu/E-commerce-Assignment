import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Eye, EyeOff, User, Lock, AlertCircle, Loader2, ArrowLeft, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import api from '@/services/api';
import { useAuth, UserRole } from '@/context/AuthContext';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập Email hoặc Tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [lockCountdown, setLockCountdown] = useState<number | null>(null);
  const [adminLockMessage, setAdminLockMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: '',
      password: '',
      rememberMe: false,
    },
  });

  // Countdown timer cho tài khoản bị khóa tạm thời 5 phút (FR-AUTH-009)
  useEffect(() => {
    if (lockCountdown === null || lockCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          clearErrors('root');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdown, clearErrors]);

  const onSubmit = async (data: LoginForm) => {
    if (lockCountdown !== null && lockCountdown > 0) return;
    setAdminLockMessage(null);
    clearErrors('root');

    try {
      const response = await api.post('/users/login', {
        identifier: data.identifier.trim(),
        password: data.password,
        remember_me: Boolean(data.rememberMe),
      });

      const { access_token, refresh_token, role } = response.data?.result || {};

      if (!access_token || !refresh_token) {
        throw new Error('Dữ liệu xác thực không hợp lệ từ server.');
      }

      const profile = await login(access_token, refresh_token, { role: role as UserRole });
      if (!profile) {
        setError('root', { message: 'Không thể tải hồ sơ sau đăng nhập. Vui lòng thử lại.' });
        return;
      }

      // Điều hướng chuẩn xác theo vai trò
      switch (profile.role) {
        case 'Admin':
        case 'Manager':
          navigate('/dashboard/manager', { replace: true });
          break;
        case 'Customer':
          navigate('/dashboard/user', { replace: true });
          break;
        default:
          navigate('/dashboard/user', { replace: true });
          break;
      }
    } catch (err: any) {
      const status = err.response?.status;
      const serverMessage = err.response?.data?.message || '';

      if (status === 401) {
        setError('root', { message: 'Email hoặc mật khẩu chưa đúng.' });
      } else if (status === 400 && serverMessage.includes('quá nhiều lần')) {
        setLockCountdown(300);
        setError('root', { message: 'Tài khoản tạm thời bị khóa do nhập sai mật khẩu 5 lần liên tiếp.' });
      } else if (status === 403) {
        setAdminLockMessage(serverMessage || 'Tài khoản của bạn đã bị khóa bởi Quản trị viên.');
      } else {
        setError('root', { message: serverMessage || 'Đăng nhập không thành công. Vui lòng thử lại.' });
      }
    }
  };

  const isFormLocked = lockCountdown !== null && lockCountdown > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] p-4 relative overflow-hidden">
      
      {/* ========================================================= */}
      {/* CÁC DẢI SÓNG MẢNG MÀU PASTEL UỐN LƯỢN TỪ TRÁI SANG PHẢI    */}
      {/* ========================================================= */}
      <div className="pointer-events-none absolute inset-0 w-full h-full z-0 overflow-hidden">
        <svg
          className="w-full h-full"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            {/* 1. Gradient Cam - Vàng Top-Left */}
            <linearGradient id="wave-orange" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a44" />
              <stop offset="100%" stopColor="#fc6076" />
            </linearGradient>

            {/* 2. Gradient Xanh Ngọc Top-Right */}
            <linearGradient id="wave-mint" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#80d0c7" />
              <stop offset="100%" stopColor="#0093e9" />
            </linearGradient>

            {/* 3. Gradient Xanh Dương Bottom-Left */}
            <linearGradient id="wave-blue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#74ebd5" />
              <stop offset="100%" stopColor="#9aceff" />
            </linearGradient>

            {/* 4. Gradient Hồng - Cam Bottom-Right */}
            <linearGradient id="wave-pink" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff9a9e" />
              <stop offset="100%" stopColor="#fecfef" />
            </linearGradient>
          </defs>

          {/* Dải 1: Mảng sóng Cam/Vàng phía góc trên bên trái */}
          <path
            d="M-100,-50 C300,100 450,280 150,450 C-100,550 -200,300 -100,-50 Z"
            fill="url(#wave-orange)"
            className="opacity-30 blur-2xl"
          />

          {/* Dải 2: Mảng sóng Xanh Mint uốn từ trên chạy sang phải */}
          <path
            d="M800,-100 C1100,50 1550,150 1550,400 C1300,450 950,250 800,-100 Z"
            fill="url(#wave-mint)"
            className="opacity-25 blur-2xl"
          />

          {/* Dải 3: Mảng sóng Xanh Biển uốn phía dưới bên trái */}
          <path
            d="M-150,550 C200,450 450,700 250,950 C0,1050 -150,850 -150,550 Z"
            fill="url(#wave-blue)"
            className="opacity-25 blur-2xl"
          />

          {/* Dải 4: Mảng sóng Hồng/Cam mềm uốn dưới bên phải */}
          <path
            d="M900,500 C1250,550 1600,700 1500,1000 C1100,1000 850,750 900,500 Z"
            fill="url(#wave-pink)"
            className="opacity-30 blur-2xl"
          />
        </svg>
      </div>

      {/* Nút Quay lại trang chủ */}
      <Link
        to="/"
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 font-bold transition-colors group z-20"
      >
        <div className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur-md shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </div>
        <span>Quay lại trang chủ</span>
      </Link>

      {/* CARD ĐĂNG NHẬP */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/85 backdrop-blur-2xl rounded-[44px] shadow-2xl shadow-orange-500/10 p-8 sm:p-10 space-y-8 border border-white/90 relative z-10"
      >
        {/* LOGO BIỂU TƯỢNG KHÓA MÀU CAM */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-2xl text-white shadow-lg shadow-orange-500/30 mb-4">
            <Lock size={26} />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Chào mừng trở lại</h1>
          <p className="text-gray-400 font-medium mt-1 text-sm">Đăng nhập tài khoản FitBite để tiếp tục</p>
        </div>

        {/* Cảnh báo khóa do Admin */}
        {adminLockMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-bold">Tài khoản bị khóa</p>
              <p className="mt-1">{adminLockMessage}</p>
              <p className="mt-2 text-xs text-red-600">Vui lòng liên hệ Quản trị viên để được hỗ trợ mở khóa.</p>
            </div>
          </div>
        )}

        {/* Cảnh báo khóa tạm thời (FR-AUTH-009) */}
        {isFormLocked && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800 text-sm">
            <Clock className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 animate-pulse" />
            <div>
              <p className="font-bold">Tài khoản bị khóa tạm thời</p>
              <p className="mt-1">
                Bạn đã nhập sai mật khẩu 5 lần liên tiếp. Vui lòng chờ{' '}
                <span className="font-mono font-bold text-amber-900">
                  {Math.floor(lockCountdown / 60)}:{(lockCountdown % 60).toString().padStart(2, '0')}
                </span>{' '}
                để thử lại.
              </p>
            </div>
          </div>
        )}

        {errors.root && !isFormLocked && !adminLockMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
            <span>{errors.root.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Email hoặc Tên đăng nhập"
            placeholder="Nhập email hoặc tên đăng nhập"
            icon={<User size={18} />}
            error={errors.identifier?.message}
            disabled={isFormLocked || isSubmitting}
            className="rounded-2xl py-3.5 bg-gray-50/50"
            {...register('identifier')}
          />

          <div className="space-y-1">
            <div className="relative">
              <Input
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                icon={<Lock size={18} />}
                error={errors.password?.message}
                disabled={isFormLocked || isSubmitting}
                className="rounded-2xl py-3.5 bg-gray-50/50"
                {...register('password')}
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
            <div className="flex justify-end pt-1">
              <Link
                to="/forgot-password"
                className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
          </div>

          <div className="flex items-center pt-1">
            <Checkbox
              id="rememberMe"
              label="Ghi nhớ đăng nhập"
              disabled={isFormLocked || isSubmitting}
              {...register('rememberMe')}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-black rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/30 transition-all border-none"
            disabled={isFormLocked || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                <span>Đang xử lý đăng nhập...</span>
              </span>
            ) : (
              'Đăng nhập'
            )}
          </Button>
        </form>

        <div className="text-center pt-2 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-500">
            Chưa có tài khoản FitBite?{' '}
            <Link to="/register" className="font-bold text-orange-600 hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}