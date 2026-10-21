import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Eye, EyeOff, Mail, User, Lock, Phone, CheckCircle2, AlertCircle, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Tên người dùng phải từ 3 đến 30 ký tự')
      .max(30, 'Tên người dùng tối đa 30 ký tự'),
    email: z
      .string()
      .trim()
      .email('Email không đúng định dạng')
      .min(1, 'Email là bắt buộc'),
    phone: z
      .string()
      .trim()
      .min(1, 'Số điện thoại là bắt buộc')
      .regex(/^(0|\+84)[0-9]{9,10}$/, 'Số điện thoại không hợp lệ (10 chữ số)'),
    password: z
      .string()
      .min(8, 'Mật khẩu phải từ 8 đến 50 ký tự')
      .max(50, 'Mật khẩu tối đa 50 ký tự')
      .refine(
        (val) => new TextEncoder().encode(val).length <= 72,
        'Mật khẩu vượt quá giới hạn 72 byte UTF-8'
      ),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu'),
    acceptTos: z.boolean().refine((val) => val === true, {
      message: 'Bạn cần đồng ý với Điều khoản sử dụng và Chính sách bảo mật',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp với mật khẩu',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptTos: false,
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    clearErrors();

    try {
      const payload = {
        email: data.email.trim().toLowerCase(),
        username: data.username.trim(),
        password: data.password,
        confirm_password: data.confirmPassword,
        phone: data.phone.trim(),
        role: 'Customer',
      };

      const response = await api.post('/users/register', payload);

      const { access_token, refresh_token } = response.data?.result || {};
      if (access_token && refresh_token) {
        await login(access_token, refresh_token, { role: 'Customer' });
      }

      setIsSuccess(true);

      setTimeout(() => {
        navigate(access_token && refresh_token ? '/' : '/login', { replace: true });
      }, 1500);
    } catch (err: any) {
      const status = err.response?.status;
      const responseData = err.response?.data;

      // Xử lý lỗi validation 422 từ Express Validator
      if (status === 422 && responseData?.errors) {
        const serverErrors = responseData.errors;

        if (serverErrors.email) {
          setError('email', { message: serverErrors.email.msg || 'Email đã tồn tại' });
        }
        if (serverErrors.username) {
          setError('username', { message: serverErrors.username.msg || 'Tên người dùng đã được sử dụng' });
        }
        if (serverErrors.password) {
          setError('password', { message: serverErrors.password.msg });
        }
        if (serverErrors.confirm_password) {
          setError('confirmPassword', { message: serverErrors.confirm_password.msg });
        }
        if (serverErrors.phone) {
          setError('phone', { message: serverErrors.phone.msg });
        }

        const firstKey = Object.keys(serverErrors)[0];
        if (firstKey && !['email', 'username', 'password', 'confirmPassword', 'phone'].includes(firstKey)) {
          setError('root', { message: serverErrors[firstKey].msg });
        }
      } else if (status === 409 || responseData?.message?.includes('Email đã tồn tại')) {
        setError('email', { message: 'Email đã tồn tại trong hệ thống. Vui lòng dùng email khác.' });
      } else {
        setError('root', { message: responseData?.message || 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.' });
      }
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[40px] shadow-2xl p-10 text-center space-y-6 border border-gray-100"
        >
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 size={44} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Đăng ký thành công!</h2>
            <p className="text-gray-500 font-medium text-sm">
              Chào mừng bạn đến với FitBite. Hệ thống đang chuyển hướng tới trang chủ...
            </p>
          </div>
          <div className="flex justify-center pt-2">
            <Loader2 className="animate-spin text-orange-500" size={28} />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-4 py-12 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-100 rounded-full blur-[120px] opacity-50" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-100 rounded-full blur-[120px] opacity-50" />

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
        className="max-w-lg w-full bg-white/90 backdrop-blur-xl rounded-[40px] shadow-2xl shadow-orange-500/5 p-8 sm:p-10 space-y-8 border border-white relative z-10"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-2xl text-white shadow-lg shadow-orange-500/30 mb-4">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Tạo tài khoản mới</h1>
          <p className="text-gray-500 mt-2 text-sm">Khởi đầu lối sống ăn uống lành mạnh cùng FitBite</p>
        </div>

        {errors.root && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
            <span>{errors.root.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Tên người dùng (Họ và tên)"
            placeholder="Ví dụ: Huy Phúc hoặc nguyenvanan"
            icon={<User size={18} />}
            error={errors.username?.message}
            disabled={isSubmitting}
            {...register('username')}
          />

          <Input
            label="Địa chỉ Email"
            type="email"
            placeholder="your-email@example.com"
            icon={<Mail size={18} />}
            error={errors.email?.message}
            disabled={isSubmitting}
            {...register('email')}
          />

          <Input
            label="Số điện thoại"
            type="tel"
            placeholder="0901234567"
            icon={<Phone size={18} />}
            error={errors.phone?.message}
            disabled={isSubmitting}
            {...register('phone')}
          />

          <div className="relative">
            <Input
              label="Mật khẩu"
              type={showPassword ? 'text' : 'password'}
              placeholder="Tối thiểu 8 ký tự (tối đa 50 ký tự)"
              icon={<Lock size={18} />}
              error={errors.password?.message}
              disabled={isSubmitting}
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

          <div className="relative">
            <Input
              label="Xác nhận mật khẩu"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Nhập lại chính xác mật khẩu trên"
              icon={<Lock size={18} />}
              error={errors.confirmPassword?.message}
              disabled={isSubmitting}
              {...register('confirmPassword')}
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

          <div className="pt-2">
            <Checkbox
              id="acceptTos"
              label="Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của FitBite"
              error={errors.acceptTos?.message}
              disabled={isSubmitting}
              {...register('acceptTos')}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-bold rounded-2xl shadow-lg shadow-orange-500/25 mt-4 min-h-[44px]"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                <span>Đang xử lý đăng ký...</span>
              </span>
            ) : (
              'Tạo tài khoản'
            )}
          </Button>
        </form>

        <div className="text-center pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            Đã có tài khoản?{' '}
            <Link to="/login" className="font-bold text-orange-600 hover:underline">
              Đăng nhập ngay
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
