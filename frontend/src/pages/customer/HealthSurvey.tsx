import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, 
  ChevronLeft, 
  User, 
  Activity, 
  Target, 
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const steps = [
  { id: 'gender', title: 'Giới tính của bạn?' },
  { id: 'metrics', title: 'Chỉ số cơ thể' },
  { id: 'activity', title: 'Mức độ vận động' },
  { id: 'goal', title: 'Mục tiêu của bạn' },
  { id: 'allergies', title: 'Dị ứng & Kiêng kỵ' },
];

const activityLevels = [
  { value: 1.2, label: 'Ít vận động', desc: 'Làm việc văn phòng, ít tập thể dục' },
  { value: 1.375, label: 'Vận động nhẹ', desc: 'Tập thể dục 1-3 ngày/tuần' },
  { value: 1.55, label: 'Vận động vừa', desc: 'Tập thể dục 3-5 ngày/tuần' },
  { value: 1.725, label: 'Vận động mạnh', desc: 'Tập thể dục 6-7 ngày/tuần' },
];

const goals = [
  { value: 'Lose', label: 'Giảm mỡ', desc: 'Giảm cân lành mạnh' },
  { value: 'Maintain', label: 'Giữ dáng', desc: 'Duy trì cân nặng hiện tại' },
  { value: 'Gain', label: 'Tăng cơ', desc: 'Tăng khối lượng cơ bắp' },
];

const commonAllergies = [
  'Hải sản', 'Đậu phộng', 'Thịt bò', 'Sữa', 'Trứng', 'Ăn chay (Vegan)', 'Không hành/tỏi'
];

export default function HealthSurvey() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    gender: 'Male',
    age: 25,
    height: 170,
    weight: 65,
    activityLevel: 1.375,
    goal: 'Maintain',
    allergies: [] as string[],
  });
  const navigate = useNavigate();

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Submit data
      console.log('Survey Data:', formData);
      navigate('/dashboard');
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleAllergy = (allergy: string) => {
    setFormData(prev => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter(a => a !== allergy)
        : [...prev.allergies, allergy]
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-gray-200 flex">
        {steps.map((_, idx) => (
          <div 
            key={idx}
            className={cn(
              "flex-1 h-full transition-all duration-500",
              idx <= currentStep ? "bg-orange-500" : "bg-transparent"
            )}
          />
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl p-8 md:p-12 space-y-8">
          <div className="space-y-2 text-center">
            <p className="text-orange-500 font-bold text-sm uppercase tracking-widest">
              Bước {currentStep + 1} / {steps.length}
            </p>
            <h2 className="text-3xl font-bold text-gray-900">{steps[currentStep].title}</h2>
          </div>

          <div className="min-h-[300px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Step 1: Gender */}
                {currentStep === 0 && (
                  <div className="grid grid-cols-2 gap-6">
                    <button
                      onClick={() => setFormData({ ...formData, gender: 'Male' })}
                      className={cn(
                        "p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-4",
                        formData.gender === 'Male' ? "border-orange-500 bg-orange-50" : "border-gray-100 hover:border-orange-200"
                      )}
                    >
                      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", formData.gender === 'Male' ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400")}>
                        <User size={32} />
                      </div>
                      <span className="font-bold">Nam</span>
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, gender: 'Female' })}
                      className={cn(
                        "p-8 rounded-3xl border-2 transition-all flex flex-col items-center gap-4",
                        formData.gender === 'Female' ? "border-orange-500 bg-orange-50" : "border-gray-100 hover:border-orange-200"
                      )}
                    >
                      <div className={cn("w-16 h-16 rounded-full flex items-center justify-center", formData.gender === 'Female' ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400")}>
                        <User size={32} />
                      </div>
                      <span className="font-bold">Nữ</span>
                    </button>
                  </div>
                )}

                {/* Step 2: Metrics */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Tuổi</label>
                        <span className="text-xs font-bold text-orange-500 uppercase">0 - 100 tuổi</span>
                      </div>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0" 
                          max="100"
                          value={formData.age || ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                            setFormData({ ...formData, age: isNaN(val) ? 0 : Math.min(100, val) });
                          }}
                          className="w-full h-14 px-6 bg-gray-50 border-2 border-gray-100 rounded-2xl text-lg font-bold text-gray-900 focus:outline-none focus:border-orange-500 transition-all"
                          placeholder="Nhập số tuổi..."
                        />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">tuổi</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Chiều cao</label>
                        <span className="text-xs font-bold text-orange-500 uppercase">0 - 250 cm</span>
                      </div>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0" 
                          max="250"
                          value={formData.height || ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                            setFormData({ ...formData, height: isNaN(val) ? 0 : Math.min(250, val) });
                          }}
                          className="w-full h-14 px-6 bg-gray-50 border-2 border-gray-100 rounded-2xl text-lg font-bold text-gray-900 focus:outline-none focus:border-orange-500 transition-all"
                          placeholder="Nhập chiều cao..."
                        />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">cm</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Cân nặng</label>
                        <span className="text-xs font-bold text-orange-500 uppercase">0 - 200 kg</span>
                      </div>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0" 
                          max="200"
                          value={formData.weight || ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                            setFormData({ ...formData, weight: isNaN(val) ? 0 : Math.min(200, val) });
                          }}
                          className="w-full h-14 px-6 bg-gray-50 border-2 border-gray-100 rounded-2xl text-lg font-bold text-gray-900 focus:outline-none focus:border-orange-500 transition-all"
                          placeholder="Nhập cân nặng..."
                        />
                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">kg</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Activity */}
                {currentStep === 2 && (
                  <div className="space-y-4">
                    {activityLevels.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setFormData({ ...formData, activityLevel: level.value })}
                        className={cn(
                          "w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4",
                          formData.activityLevel === level.value ? "border-orange-500 bg-orange-50" : "border-gray-100 hover:border-orange-200"
                        )}
                      >
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", formData.activityLevel === level.value ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-400")}>
                          <Activity size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{level.label}</p>
                          <p className="text-xs text-gray-500">{level.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Step 4: Goal */}
                {currentStep === 3 && (
                  <div className="space-y-4">
                    {goals.map((goal) => (
                      <button
                        key={goal.value}
                        onClick={() => setFormData({ ...formData, goal: goal.value as any })}
                        className={cn(
                          "w-full p-6 rounded-3xl border-2 text-center transition-all",
                          formData.goal === goal.value ? "border-orange-500 bg-orange-50" : "border-gray-100 hover:border-orange-200"
                        )}
                      >
                        <p className="text-xl font-bold text-gray-900">{goal.label}</p>
                        <p className="text-sm text-gray-500 mt-1">{goal.desc}</p>
                      </button>
                    ))}
                  </div>
                )}

                {/* Step 5: Allergies */}
                {currentStep === 4 && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500 text-center mb-4">Chọn những thứ bạn không thể ăn hoặc đang kiêng kỵ</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {commonAllergies.map((allergy) => (
                        <button
                          key={allergy}
                          onClick={() => toggleAllergy(allergy)}
                          className={cn(
                            "px-6 py-3 rounded-full border-2 font-medium transition-all",
                            formData.allergies.includes(allergy) 
                              ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200" 
                              : "bg-white border-gray-100 text-gray-600 hover:border-orange-200"
                          )}
                        >
                          {allergy}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex gap-4 pt-8">
            {currentStep > 0 && (
              <Button 
                variant="outline" 
                className="flex-1 h-12 rounded-2xl"
                onClick={prevStep}
              >
                <ChevronLeft size={20} className="mr-2" /> Quay lại
              </Button>
            )}
            <Button 
              className="flex-[2] h-12 rounded-2xl bg-orange-500 hover:bg-orange-600"
              onClick={nextStep}
            >
              {currentStep === steps.length - 1 ? 'Hoàn thành' : 'Tiếp tục'} <ChevronRight size={20} className="ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
