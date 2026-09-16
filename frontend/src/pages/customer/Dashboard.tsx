import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Flame, 
  Zap, 
  Target, 
  Info, 
  TrendingUp, 
  Utensils, 
  UserCheck 
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

// Thông tin người dùng (Dữ liệu mẫu cho tính toán)
const userProfile = {
  gender: 'Male',
  age: 25,
  height: 175,
  weight: 70,
  activityLevel: 1.55,
  goal: 'Lose',
};

export default function Dashboard() {
  // BMR Calculation (Mifflin-St Jeor)
  const bmr = useMemo(() => {
    const { gender, weight, height, age } = userProfile;
    if (gender === 'Male') {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    }
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }, []);

  const tdee = Math.round(bmr * userProfile.activityLevel);
  
  const targetCalories = useMemo(() => {
    if (userProfile.goal === 'Lose') return tdee - 500;
    if (userProfile.goal === 'Gain') return tdee + 500;
    return tdee;
  }, [tdee]);

  // Macros Calculation
  const macros = useMemo(() => {
    const protein = Math.round((targetCalories * 0.3) / 4);
    const carbs = Math.round((targetCalories * 0.4) / 4);
    const fat = Math.round((targetCalories * 0.3) / 9);
    return [
      { name: 'Protein', value: protein, color: '#f97316' },
      { name: 'Tinh bột', value: carbs, color: '#3b82f6' },
      { name: 'Chất béo', value: fat, color: '#10b981' },
    ];
  }, [targetCalories]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-6 py-8 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo sức khỏe</h1>
          <p className="text-gray-500">Dựa trên thông tin bạn vừa cung cấp</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center space-y-4"
          >
            <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
              <Flame size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 flex items-center justify-center gap-1">
                BMR (Calo cơ bản)
                <span className="cursor-help text-gray-400" title="Năng lượng tối thiểu để duy trì sự sống"><Info size={14} /></span>
              </p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{Math.round(bmr)}</h3>
              <p className="text-xs text-gray-400 mt-1">kcal / ngày</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center text-center space-y-4"
          >
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
              <Zap size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 flex items-center justify-center gap-1">
                TDEE (Calo tiêu hao)
                <span className="cursor-help text-gray-400" title="Tổng năng lượng đốt cháy một ngày"><Info size={14} /></span>
              </p>
              <h3 className="text-3xl font-bold text-gray-900 mt-1">{tdee}</h3>
              <p className="text-xs text-gray-400 mt-1">kcal / ngày</p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-orange-500 p-8 rounded-3xl shadow-lg shadow-orange-200 flex flex-col items-center text-center space-y-4 text-white"
          >
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Target size={28} />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-100">Calo mục tiêu</p>
              <h3 className="text-4xl font-black mt-1">{targetCalories}</h3>
              <p className="text-xs text-orange-100 mt-1">kcal / ngày</p>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-full text-xs font-medium">
              Mục tiêu: Giảm 0.5kg / tuần
            </div>
          </motion.div>
        </div>

        {/* Macros & Chart Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-xl font-bold text-gray-900">Phân bổ dinh dưỡng (Macro)</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={macros}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {macros.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {macros.map((m) => (
                <div key={m.name} className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                    <span className="text-xs font-bold text-gray-500 uppercase">{m.name}</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{m.value}g</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Link to="/food-catalog" className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6 hover:shadow-md hover:border-orange-200 transition-all group">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-green-200 transition-colors">
                <Utensils size={32} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900 group-hover:text-orange-500 transition-colors">Gợi ý thực đơn</h4>
                <p className="text-sm text-gray-500">Nhận thực đơn phù hợp với mục tiêu {targetCalories} calo của bạn.</p>
                <div className="mt-3 text-orange-500 font-bold text-sm inline-flex items-center gap-1">
                  Xem ngay <TrendingUp size={14} />
                </div>
              </div>
            </Link>

            <Link to="/pt-directory" className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-6 hover:shadow-md hover:border-orange-200 transition-all group">
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-purple-200 transition-colors">
                <UserCheck size={32} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-gray-900 group-hover:text-orange-500 transition-colors">Tìm kiếm PT</h4>
                <p className="text-sm text-gray-500">Kết nối với huấn luyện viên chuyên nghiệp để đạt mục tiêu nhanh hơn.</p>
                <div className="mt-3 text-orange-500 font-bold text-sm inline-flex items-center gap-1">
                  Khám phá <TrendingUp size={14} />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center md:hidden">
        <Link to="/dashboard" className="flex flex-col items-center gap-1 text-orange-500">
          <Target size={20} />
          <span className="text-[10px] font-bold">Dashboard</span>
        </Link>
        <Link to="/food-catalog" className="flex flex-col items-center gap-1 text-gray-400">
          <Utensils size={20} />
          <span className="text-[10px] font-bold">Thực đơn</span>
        </Link>
        <Link to="/pt-directory" className="flex flex-col items-center gap-1 text-gray-400">
          <UserCheck size={20} />
          <span className="text-[10px] font-bold">PT</span>
        </Link>
      </div>
    </div>
  );
}
