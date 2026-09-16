import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Mail, User, Lock, Phone, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Sparkles, ShieldCheck, Heart } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const registerSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  username: z.string().min(3, 'Tên đăng nhập ít nhất 3 ký tự'),
  password: z.string()
    .min(8, 'Mật khẩu phải dài ít nhất 8 ký tự')
    .regex(/[A-Z]/, 'Phải có ít nhất 1 chữ hoa')
    .regex(/[a-z]/, 'Phải có ít nhất 1 chữ thường')
    .regex(/[0-9]/, 'Phải có ít nhất 1 con số'),
  confirmPassword: z.string(),
  phone: z.string().regex(/^[0-9]{10}$/, 'Số điện thoại phải đúng 10 chữ số'),
  role: z.enum(['Customer', 'PT']),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [role, setRole] = useState<'Customer' | 'PT'>('Customer');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    clearErrors
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'Customer',
    }
  });

  const password = watch('password');
  const username = watch('username');

  // Password strength logic
  useEffect(() => {
    if (!password) {
      setPasswordStrength(0);
      return;
    }
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    setPasswordStrength(strength);
  }, [password]);

  // Real-time username check (Debounced)
  useEffect(() => {
    const checkUsername = async () => {
      if (username && username.length >= 3) {
        setUsernameStatus('checking');
        try {
          // Gọi API check-username
          const res = await api.get(`/users/check-username?username=${username}`);
          if (res.data.exists) {
            setUsernameStatus('taken');
            setError('username', { message: res.data.message || 'Tên đăng nhập này đã được sử dụng' });
          } else {
            setUsernameStatus('available');
            clearErrors('username');
          }
        } catch (err) {
          setUsernameStatus('idle');
        }
      } else {
        setUsernameStatus('idle');
      }
    };

const timer = setTimeout(checkUsername, 500);
    return () => clearTimeout(timer);
  }, [username, setError, clearErrors]);

  const onSubmit = async (data: RegisterForm) => {
    try {
      // API Spec yêu cầu payload đăng ký
      const payload = {
        email: data.email,
        username: data.username,
        password: data.password,
        confirm_password: data.confirmPassword,
        phone: data.phone,
        role: data.role
      };

      const response = await api.post('/users/register', payload);

      if (data.role === 'Customer') {
        const { access_token, refresh_token } = response.data.result || {};
        if (access_token && refresh_token) {
          await login(access_token, refresh_token);
          localStorage.setItem('userRole', 'Customer');
        }
      }

      setIsSuccess(true);

      setTimeout(() => {
        navigate(data.role === 'Customer' ? '/dashboard/user' : '/login');
      }, 1500);

    } catch (err: any) {
      // Ưu tiên hiển thị lỗi validation 422 từ backend nếu có
      let errorMsg = err.response?.data?.message || 'Đăng ký thất bại';
      if (err.response?.status === 422 && err.response?.data?.errors) {
         // Lấy lỗi đầu tiên từ object errors
         const firstErrorKey = Object.keys(err.response.data.errors)[0];
         errorMsg = err.response.data.errors[firstErrorKey].msg;
      }
      setError('root', { message: errorMsg });
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 text-center space-y-8 border border-gray-50"
        >
          <div className="w-24 h-24 bg-green-50 text-green-500 rounded-3xl flex items-center justify-center mx-auto rotate-12">
            <CheckCircle2 size={48} />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl font-black text-gray-900">
              {role === 'Customer' ? 'Tuyệt vời!' : 'Hồ sơ đã gửi!'}
            </h2>
            <p className="text-gray-500 font-medium">
              {role === 'Customer' 
                ? 'Chào mừng bạn đến với cộng đồng sức khỏe của chúng tôi. Đang chuyển hướng...' 
                : 'Chúng tôi sẽ xem xét hồ sơ của bạn và phản hồi sớm nhất có thể.'}
            </p>
          </div>
          {role === 'Customer' && (
            <Button className="w-full py-6 rounded-2xl text-lg font-black" onClick={() => navigate('/login')}>
              Đăng nhập ngay
            </Button>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4 py-12 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-100 rounded-full blur-[150px] opacity-60" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-100 rounded-full blur-[150px] opacity-60" />

      <Link 
        to="/" 
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors group z-10"
      >
        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </div>
        <span className="hidden sm:inline">Quay lại trang chủ</span>
      </Link>

      <div className="max-w-5xl w-full bg-white/80 backdrop-blur-xl rounded-[48px] shadow-2xl shadow-orange-500/5 overflow-hidden flex flex-col lg:flex-row border border-white relative z-10">
        {/* Left Side - Brand & Features */}
        <div className="lg:w-[40%] bg-gradient-to-br from-orange-500 to-orange-600 p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full -ml-32 -mb-32 blur-3xl" />
          
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8">
              <Sparkles size={32} />
            </div>
            <h1 className="text-4xl font-black leading-tight">Bắt đầu hành trình mới</h1>
            <p className="mt-6 text-orange-100 font-medium text-lg">Tham gia cùng hàng ngàn người đang thay đổi cuộc sống mỗi ngày.</p>
          </div>

          <div className="space-y-8 relative z-10 mt-12 lg:mt-0">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <Heart size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Sức khỏe là vàng</h3>
                <p className="text-sm text-orange-100">Chế độ dinh dưỡng khoa học được thiết kế riêng cho bạn.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h3 className="font-bold text-lg">Đội ngũ chuyên gia</h3>
                <p className="text-sm text-orange-100">Kết nối với những PT hàng đầu để đạt mục tiêu nhanh nhất.</p>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/20 relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-200">FitBite Community</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="flex-1 p-8 lg:p-16">
          <div className="mb-10">
            <h2 className="text-3xl font-black text-gray-900">Tạo tài khoản</h2>
            <p className="text-gray-500 font-medium mt-2">Chỉ mất 1 phút để bắt đầu thay đổi bản thân.</p>
          </div>

          {/* Role Tabs */}
          <div className="flex p-1.5 bg-gray-100/50 rounded-2xl mb-10">
            <button
              type="button"
              onClick={() => { setRole('Customer'); setValue('role', 'Customer'); }}
              className={cn(
                "flex-1 py-3 text-sm font-black rounded-xl transition-all",
                role === 'Customer' ? "bg-white text-orange-500 shadow-lg shadow-orange-500/5" : "text-gray-400 hover:text-gray-600"
              )}
            >
              Khách hàng
            </button>
            <button
              type="button"
              onClick={() => { setRole('PT'); setValue('role', 'PT'); }}
              className={cn(
                "flex-1 py-3 text-sm font-black rounded-xl transition-all",
                role === 'PT' ? "bg-white text-orange-500 shadow-lg shadow-orange-500/5" : "text-gray-400 hover:text-gray-600"
              )}
            >
              Huấn luyện viên
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <Input
                label="Email"
                placeholder="example@gmail.com"
                icon={<Mail size={18} />}
                error={errors.email?.message}
                className="rounded-2xl py-4"
                {...register('email')}
              />
            </div>

            <div className="relative md:col-span-2">
              <Input
                label="Tên đăng nhập"
                placeholder="username123"
                icon={<User size={18} />}
                error={errors.username?.message}
                className="rounded-2xl py-4"
                {...register('username')}
              />
              <div className="absolute right-4 top-11">
                {usernameStatus === 'checking' && <Loader2 className="animate-spin text-gray-400" size={18} />}
                {usernameStatus === 'available' && <CheckCircle2 className="text-green-500" size={18} />}
                {usernameStatus === 'taken' && <AlertCircle className="text-red-500" size={18} />}
              </div>
            </div>

            <div className="relative">
              <Input
                label="Mật khẩu"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                icon={<Lock size={18} />}
                error={errors.password?.message}
                className="rounded-2xl py-4"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-11 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
              
              {password && (
                <div className="mt-2 px-1">
                  <div className="flex gap-1 h-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 rounded-full transition-all duration-500",
                          i <= passwordStrength 
                            ? (passwordStrength <= 2 ? "bg-red-500" : passwordStrength === 3 ? "bg-yellow-500" : "bg-green-500")
                            : "bg-gray-200"
                        )}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Xác nhận mật khẩu"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              icon={<Lock size={18} />}
              error={errors.confirmPassword?.message}
              className="rounded-2xl py-4"
              {...register('confirmPassword')}
            />

            <div className="md:col-span-2">
              <Input
                label="Số điện thoại"
                placeholder="0912345678"
                icon={<Phone size={18} />}
                error={errors.phone?.message}
                className="rounded-2xl py-4"
                {...register('phone')}
              />
            </div>

            {errors.root && (
              <div className="md:col-span-2 p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold flex items-center gap-3">
                <AlertCircle size={20} />
                {errors.root.message}
              </div>
            )}

            <div className="md:col-span-2 pt-4">
              <Button type="submit" className="w-full py-6 rounded-2xl text-lg font-black shadow-xl shadow-orange-500/20" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" size={22} /> : null}
                Đăng ký ngay
              </Button>
            </div>

            <p className="md:col-span-2 text-center text-sm text-gray-500 mt-4">
              Đã có tài khoản?{' '}
              <Link to="/login" className="text-orange-500 font-black hover:underline">
                Đăng nhập
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
