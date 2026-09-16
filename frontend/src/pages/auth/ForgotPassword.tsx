import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'motion/react';
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const forgotSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const [isSent, setIsSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    try {
      // Giả lập gọi API gửi email khôi phục
      console.log('Sending reset link to:', data.email);
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsSent(true);
    } catch (err) {
      console.error(err);
    }
  };

  if (isSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center space-y-6"
        >
          <div className="w-20 h-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mx-auto">
            <Mail size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Kiểm tra Email của bạn</h2>
            <p className="text-gray-500">
              Chúng tôi đã gửi một đường link khôi phục mật khẩu vào email của bạn. Đường link sẽ hết hạn sau 15 phút.
            </p>
          </div>
          <Link to="/login">
            <Button variant="outline" className="w-full mt-4">
              <ArrowLeft size={18} className="mr-2" /> Quay lại Đăng nhập
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 space-y-8"
      >
        <div className="space-y-2">
          <Link to="/login" className="inline-flex items-center text-sm text-gray-500 hover:text-orange-500 transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Quay lại
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Quên mật khẩu?</h1>
          <p className="text-gray-500">Đừng lo lắng, hãy nhập email của bạn để khôi phục quyền truy cập.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Email đã đăng ký"
            placeholder="your-email@gmail.com"
            icon={<Mail size={18} />}
            error={errors.email?.message}
            {...register('email')}
          />

          <Button type="submit" className="w-full h-12 text-lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="animate-spin mr-2" size={20} />
            ) : null}
            Gửi link khôi phục
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
