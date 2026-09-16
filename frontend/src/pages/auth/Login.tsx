import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Eye, EyeOff, User, Lock, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập Email hoặc Tên đăng nhập'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    if (isLocked) return;

    try {
      setFailedAttempts(0);

      // Gọi API Login
      const response = await api.post('/users/login', {
        identifier: data.identifier,
        password: data.password,
        remember_me: data.rememberMe || false
      });

      // API Spec: response.data.result chứa token và role
      const { access_token, refresh_token, role } = response.data.result;

      // Cập nhật token + user state qua AuthContext
      await login(access_token, refresh_token);
      localStorage.setItem('userRole', role);

      // Điều hướng theo Role
      if (role === 'Admin') {
        navigate('/dashboard/admin');
      } else if (role === 'PT') {
        navigate('/dashboard/pt-view');
      } else {
        navigate('/dashboard/user');
      }
      
    } catch (err: any) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 5) {
        setIsLocked(true);
        setTimeout(() => {
          setIsLocked(false);
          setFailedAttempts(0);
        }, 300000); // Khóa 5 phút
      }

      // Lấy câu báo lỗi từ backend trả về (theo chuẩn API spec: err.response.data.message)
      const errorMessage = err.response?.data?.message || 'Email/Tên đăng nhập hoặc mật khẩu không chính xác.';
      
      setError('root', { 
        message: newAttempts >= 5 
          ? 'Bạn đã nhập sai quá nhiều lần. Tài khoản bị khóa trong 5 phút.' 
          : errorMessage 
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-100 rounded-full blur-[120px] opacity-50" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px] opacity-50" />

      <Link 
        to="/" 
        className="absolute top-8 left-8 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors group z-10"
      >
        <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
          <ArrowLeft size={20} />
        </div>
        <span>Quay lại trang chủ</span>
      </Link>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-[40px] shadow-2xl shadow-orange-500/5 p-10 space-y-8 border border-white relative z-10"
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Chào mừng trở lại</h1>
          <p className="text-gray-500 mt-2">Vui lòng đăng nhập để tiếp tục</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Email hoặc Tên đăng nhập"
            placeholder="username or email@gmail.com"
            icon={<User size={18} />}
            error={errors.identifier?.message}
            disabled={isLocked}
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
                disabled={isLocked}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-10 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="flex justify-end">
              <Link to="/forgot-password" title="Quên mật khẩu?" className="text-xs font-semibold text-orange-500 hover:underline">
                Quên mật khẩu?
              </Link>
            </div>
          </div>

          <Checkbox 
            label="Ghi nhớ đăng nhập" 
            {...register('rememberMe')}
          />

          {errors.root && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {errors.root.message}
            </div>
          )}

          <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting || isLocked}>
            {isSubmitting ? (
              <Loader2 className="animate-spin mr-2" size={20} />
            ) : null}
            Đăng nhập
          </Button>

          <p className="text-center text-sm text-gray-500">
            Chưa có tài khoản?{' '}
            <Link to="/register" className="text-orange-500 font-semibold hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
