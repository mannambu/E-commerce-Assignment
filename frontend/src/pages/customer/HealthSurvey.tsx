import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ChevronRight,
  ChevronLeft,
  User,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  Flame,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Info,
  Calendar,
  Utensils,
  ArrowLeft,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import Navbar from '@/components/layout/Navbar';
import api from '@/services/api';
import { useAuth, UserHealthProfile } from '@/context/AuthContext';

// Danh sách 5 mức độ vận động chuẩn backend
const ACTIVITY_LEVELS: Array<{
  value: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active';
  label: string;
  factor: string;
  desc: string;
}> = [
  { value: 'Sedentary', label: 'Ít vận động', factor: '1.2', desc: 'Làm việc văn phòng, ít vận động thể chất' },
  { value: 'Light', label: 'Vận động nhẹ', factor: '1.375', desc: 'Tập thể dục nhẹ 1–3 ngày/tuần' },
  { value: 'Moderate', label: 'Vận động vừa', factor: '1.55', desc: 'Tập thể dục vừa phải 3–5 ngày/tuần' },
  { value: 'Active', label: 'Vận động nhiều', factor: '1.725', desc: 'Tập thể thao tích cực 6–7 ngày/tuần' },
  { value: 'Very Active', label: 'Cực kỳ năng động', factor: '1.9', desc: 'Vận động viên hoặc công việc lao động nặng' },
];

// Danh sách mục tiêu sức khỏe
const GOALS: Array<{
  value: 'LoseFat' | 'MaintainWeight' | 'GainMuscle';
  label: string;
  targetDelta: string;
  desc: string;
}> = [
  { value: 'LoseFat', label: 'Giảm mỡ / Giảm cân', targetDelta: '-15% TDEE', desc: 'Giảm lượng mỡ thừa, thâm hụt calo an toàn (từ 16 tuổi trở lên)' },
  { value: 'MaintainWeight', label: 'Duy trì cân nặng', targetDelta: '100% TDEE', desc: 'Giữ vóc dáng và cân nặng ổn định hiện tại' },
  { value: 'GainMuscle', label: 'Tăng cơ / Tăng cân', targetDelta: '+10% TDEE', desc: 'Tăng khối lượng cơ bắp, bổ sung năng lượng vận động' },
];

const COMMON_ALLERGENS = [
  'Hải sản',
  'Tôm',
  'Cua',
  'Đậu phộng',
  'Đậu nành',
  'Sữa bò (Lactose)',
  'Trứng',
  'Gluten (Lúa mì)',
  'Thịt bò',
  'Ăn chay (Vegan)',
];

export default function HealthSurvey() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const noticeBanner = (location.state as any)?.notice;

  // Mode: 'survey' (WF-06) hoặc 'metrics' (WF-07 Thẻ chỉ số)
  const [viewMode, setViewMode] = useState<'survey' | 'metrics'>('survey');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form Data (WF-06)
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [age, setAge] = useState<number>(25);
  const [heightCm, setHeightCm] = useState<number>(170);
  const [weightKg, setWeightKg] = useState<number>(65);
  const [activityLevel, setActivityLevel] = useState<'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active'>('Moderate');
  const [goal, setGoal] = useState<'LoseFat' | 'MaintainWeight' | 'GainMuscle'>('MaintainWeight');
  const [parentalConsent, setParentalConsent] = useState(false);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [customAllergyInput, setCustomAllergyInput] = useState('');

  // Result Metrics (WF-07)
  const [metrics, setMetrics] = useState<UserHealthProfile | null>(null);

  // Kiểm tra hồ sơ hiện tại khi tải trang
  useEffect(() => {
    const fetchExistingMetrics = async () => {
      try {
        setIsLoadingInitial(true);
        const res = await api.get('/users/health-metrics');
        const data = res.data?.result || res.data;
        if (data && data.bmr && data.tdee) {
          setMetrics(data);
          setViewMode('metrics');
          // Điền lại form nếu muốn sửa
          setGender(data.gender || 'Male');
          setAge(data.age || 25);
          setHeightCm(data.heightCm || 170);
          setWeightKg(data.weightKg || 65);
          setActivityLevel(data.activityLevel || 'Moderate');
          setGoal(data.goal || 'MaintainWeight');
          setAllergies(data.allergies || []);
        } else {
          setViewMode('survey');
        }
      } catch (err) {
        setViewMode('survey');
      } finally {
        setIsLoadingInitial(false);
      }
    };

    fetchExistingMetrics();
  }, []);

  // Validation Bước 1 (Chỉ số cơ thể)
  const validateStep1 = () => {
    if (heightCm < 100 || heightCm > 250) {
      setErrorMessage('Chiều cao phải từ 100 cm đến 250 cm (FR-HLT-002)');
      return false;
    }
    if (weightKg < 25 || weightKg > 300) {
      setErrorMessage('Cân nặng phải từ 25 kg đến 300 kg (FR-HLT-002)');
      return false;
    }
    if (age < 10 || age > 100) {
      setErrorMessage('Độ tuổi khảo sát hợp lệ từ 10 đến 100 tuổi (FR-HLT-002)');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // Validation Bước 2 (Vận động & Mục tiêu)
  const validateStep2 = () => {
    // Ràng buộc tuổi FR-HLT-002
    if (age >= 10 && age <= 15) {
      if (goal !== 'MaintainWeight') {
        setErrorMessage('Độ tuổi 10–15 chỉ được chọn mục tiêu Duy trì cân nặng để đảm bảo an toàn phát triển');
        return false;
      }
      if (!parentalConsent) {
        setErrorMessage('Bạn cần có sự xác nhận của phụ huynh/người giám hộ cho độ tuổi 10–15');
        return false;
      }
    } else if (age < 16 && goal === 'LoseFat') {
      setErrorMessage('Mục tiêu Giảm mỡ/Giảm cân chỉ áp dụng cho người dùng từ 16 tuổi trở lên');
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
      // Tự động điều chỉnh mục tiêu nếu tuổi 10-15
      if (age >= 10 && age <= 15) {
        setGoal('MaintainWeight');
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!validateStep2()) return;
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as any);
    }
  };

  const toggleAllergy = (tag: string) => {
    setAllergies((prev) =>
      prev.includes(tag) ? prev.filter((a) => a !== tag) : [...prev, tag]
    );
  };

  const handleAddCustomAllergy = () => {
    const trimmed = customAllergyInput.trim();
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies((prev) => [...prev, trimmed]);
      setCustomAllergyInput('');
    }
  };

  // Submit khảo sát WF-06
  const handleSubmitSurvey = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        gender,
        age: Number(age),
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        activityLevel,
        goal,
        allergies,
        notes: notes.trim(),
        parentalConsent: age >= 10 && age <= 15 ? parentalConsent : undefined,
      };

      const res = await api.post('/users/health-profile', payload);
      const updatedMetrics = res.data?.result?.metrics || res.data?.result?.profile || res.data?.result;

      if (updatedMetrics) {
        setMetrics(updatedMetrics);
      } else {
        // Tải lại metrics
        const freshRes = await api.get('/users/health-metrics');
        setMetrics(freshRes.data?.result || freshRes.data);
      }

      await refreshUser();
      window.dispatchEvent(new Event('fitbite-profile-updated'));
      setViewMode('metrics');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Không thể lưu hồ sơ sức khỏe. Vui lòng kiểm tra lại dữ liệu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="animate-spin text-orange-500" size={36} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {noticeBanner && (
          <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-2xl flex items-center gap-3 text-orange-900 text-sm font-semibold shadow-xs">
            <Info className="w-5 h-5 text-orange-600 shrink-0" />
            <span>{noticeBanner}</span>
          </div>
        )}

        {viewMode === 'metrics' && metrics ? (
          /* ==================== MÀN HÌNH WF-07: THẺ CHỈ SỐ SỨC KHỎE ==================== */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Header Thẻ chỉ số */}
            <div className="text-center space-y-2">
              <span className="px-4 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-black uppercase tracking-wider">
                Chỉ số dinh dưỡng cá nhân hóa (WF-07)
              </span>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                Chỉ số sức khỏe của bạn
              </h1>
              <p className="text-slate-500 text-sm max-w-xl mx-auto">
                Dựa trên công thức Mifflin-St Jeor và mức vận động thực tế của bạn
              </p>
            </div>

            {/* Cảnh báo an toàn y tế khi Target nâng lên = BMR (FR-HLT-008) */}
            {metrics.targetAdjustedToBmr && (
              <div className="p-4 sm:p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3.5 text-amber-900 shadow-sm">
                <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black text-base flex items-center gap-2">
                    <span>Target calo đã được nâng lên = BMR để đảm bảo an toàn</span>
                  </p>
                  <p className="text-sm leading-relaxed text-amber-800">
                    Theo khuyến nghị y khoa, mức nạp calo tối thiểu không được thấp hơn năng lượng trao đổi chất cơ bản (BMR: {metrics.bmr} kcal) để tránh suy nhược cơ thể.
                  </p>
                </div>
              </div>
            )}

            {/* 3 Thẻ Chỉ số: BMR, TDEE, Target Calories (FR-HLT-009) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Thẻ 1: BMR */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black">
                  BMR
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trao đổi chất cơ bản</p>
                  <p className="text-3xl font-black text-slate-900 mt-1">
                    {metrics.bmr?.toLocaleString('vi-VN')} <span className="text-base font-bold text-slate-400">kcal</span>
                  </p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Lượng calo tối thiểu cơ thể đốt cháy khi nghỉ ngơi hoàn toàn trong 24 giờ.
                </p>
              </div>

              {/* Thẻ 2: TDEE */}
              <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200/80 shadow-sm space-y-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center font-black">
                  TDEE
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tổng năng lượng tiêu hao</p>
                  <p className="text-3xl font-black text-slate-900 mt-1">
                    {metrics.tdee?.toLocaleString('vi-VN')} <span className="text-base font-bold text-slate-400">kcal</span>
                  </p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Calo tiêu hao thực tế hằng ngày (BMR × hệ số vận động {metrics.activityLevel}).
                </p>
              </div>

              {/* Thẻ 3: Target Calories */}
              <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-3xl p-6 sm:p-7 shadow-xl shadow-orange-500/20 space-y-4">
                <div className="w-12 h-12 bg-white/20 text-white rounded-2xl flex items-center justify-center font-black backdrop-blur-sm">
                  <Flame size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-orange-100 uppercase tracking-wider">Mục tiêu hằng ngày</p>
                  <p className="text-4xl font-black text-white mt-1">
                    {metrics.targetCalories?.toLocaleString('vi-VN')} <span className="text-lg font-bold text-orange-100">kcal</span>
                  </p>
                </div>
                <p className="text-xs text-orange-100 leading-relaxed">
                  Mức calo khuyến nghị bám sát mục tiêu ({metrics.goal === 'LoseFat' ? 'Giảm mỡ' : metrics.goal === 'GainMuscle' ? 'Tăng cơ' : 'Duy trì'}).
                </p>
              </div>
            </div>

            {/* Phân bổ Macro Đạm / Tinh bột / Béo (Macro Distribution) */}
            {metrics.macroDistribution && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <Activity className="text-orange-500" size={20} />
                  <span>Phân bổ Macro dinh dưỡng hằng ngày</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-orange-50/60 rounded-2xl border border-orange-100 space-y-1">
                    <p className="text-xs font-bold text-orange-800 uppercase">Đạm (Protein)</p>
                    <p className="text-2xl font-black text-orange-600">
                      {metrics.macroDistribution.protein} <span className="text-xs font-bold text-slate-400">g</span>
                    </p>
                    <p className="text-xs text-slate-500">Hỗ trợ phát triển và duy trì cơ bắp</p>
                  </div>

                  <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-100 space-y-1">
                    <p className="text-xs font-bold text-amber-800 uppercase">Tinh bột (Carb)</p>
                    <p className="text-2xl font-black text-amber-600">
                      {metrics.macroDistribution.carb} <span className="text-xs font-bold text-slate-400">g</span>
                    </p>
                    <p className="text-xs text-slate-500">Cung cấp năng lượng làm việc & học tập</p>
                  </div>

                  <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 space-y-1">
                    <p className="text-xs font-bold text-blue-800 uppercase">Chất béo tốt (Fat)</p>
                    <p className="text-2xl font-black text-blue-600">
                      {metrics.macroDistribution.fat} <span className="text-xs font-bold text-slate-400">g</span>
                    </p>
                    <p className="text-xs text-slate-500">Hấp thụ vitamin và cân bằng nội tiết</p>
                  </div>
                </div>
              </div>
            )}

            {/* Dị ứng đã lọc */}
            {metrics.allergies && metrics.allergies.length > 0 && (
              <div className="p-4 bg-slate-100 rounded-2xl text-xs font-medium text-slate-600 flex items-center gap-2">
                <Info size={16} className="text-slate-400 flex-shrink-0" />
                <span>
                  <strong>Đã lọc các thành phần dị ứng:</strong> {metrics.allergies.join(', ')}
                </span>
              </div>
            )}

            {/* Dòng thời gian lịch sử thay đổi chỉ số (US-09) */}
            {metrics.history && metrics.history.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                  <History className="text-orange-500" size={20} />
                  <span>Dòng thời gian lịch sử thay đổi chỉ số (WF-07)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Ghi nhận các lần cập nhật mục tiêu sức khỏe hoặc số đo cân nặng từ nhật ký cá nhân
                </p>

                <div className="divide-y divide-slate-100 overflow-hidden">
                  {metrics.history.map((item, idx) => {
                    const snap = item.profileSnapshot || {};
                    const dateFormatted = item.changedAt
                      ? new Date(item.changedAt).toLocaleString('vi-VN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Không xác định';

                    const reasonLabel =
                      item.reason === 'InitialSurvey'
                        ? 'Khảo sát ban đầu'
                        : item.reason === 'WeightUpdate'
                        ? 'Cập nhật cân nặng'
                        : 'Cập nhật mục tiêu / hồ sơ';

                    const goalLabel =
                      snap.goal === 'LoseFat'
                        ? 'Giảm cân'
                        : snap.goal === 'GainMuscle'
                        ? 'Tăng cơ'
                        : snap.goal === 'MaintainWeight'
                        ? 'Duy trì'
                        : snap.goal || '-';

                    return (
                      <div key={idx} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-start sm:items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 font-bold">
                            #{metrics.history!.length - idx}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">{reasonLabel}</span>
                              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold text-[11px]">
                                {dateFormatted}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500 mt-1 flex-wrap">
                              {snap.weightKg && <span>Cân nặng: <strong className="text-slate-700">{snap.weightKg} kg</strong></span>}
                              {snap.goal && <span>Mục tiêu: <strong className="text-slate-700">{goalLabel}</strong></span>}
                              {snap.activityLevel && <span>Vận động: <strong className="text-slate-700">{snap.activityLevel}</strong></span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:text-right shrink-0 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          {snap.bmr && (
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">BMR</span>
                              <span className="font-bold text-slate-700">{snap.bmr} kcal</span>
                            </div>
                          )}
                          {snap.tdee && (
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">TDEE</span>
                              <span className="font-bold text-slate-700">{snap.tdee} kcal</span>
                            </div>
                          )}
                          {snap.targetCalories && (
                            <div>
                              <span className="text-[10px] uppercase font-bold text-orange-500 block">Target</span>
                              <span className="font-black text-orange-600">{snap.targetCalories} kcal</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tuyên bố miễn trừ y tế (NFR-LEG-001) & Quy tắc áp dụng tuần lịch (FR-HLT-013) */}
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-700 flex items-center gap-1.5">
                <Info size={14} className="text-slate-400" /> Tuyên bố miễn trừ trách nhiệm y tế (NFR-LEG-001)
              </p>
              <p>
                Chỉ số BMR, TDEE và Target Calories được tính toán dựa trên các công thức dinh dưỡng tiêu chuẩn (Mifflin-St Jeor). Các gợi ý mang tính chất hỗ trợ xây dựng lối sống lành mạnh và không thay thế cho bất kỳ chỉ định hay chẩn đoán y khoa nào từ bác sĩ chuyên khoa.
              </p>
              <p className="text-slate-600 font-medium pt-1">
                Lưu ý: Nếu bạn điều chỉnh mục tiêu giữa tuần, thực đơn và chỉ số mới sẽ chính thức áp dụng cho chu kỳ tuần lịch kế tiếp (Thứ Hai – Chủ Nhật) theo quy định hệ thống (FR-HLT-013).
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                onClick={() => {
                  setViewMode('survey');
                  setCurrentStep(1);
                }}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Cập nhật lại số đo khảo sát
              </Button>

              <Link to="/dashboard/menu" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 shadow-lg shadow-orange-500/25">
                  Xem thực đơn gợi ý (WF-08) <ArrowRight size={18} className="ml-2" />
                </Button>
              </Link>
            </div>
          </motion.div>
        ) : (
          /* ==================== MÀN HÌNH WF-06: KHẢO SÁT 3 BƯỚC ==================== */
          <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-10 border border-slate-200/80 space-y-8">
            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Khảo sát dinh dưỡng (WF-06)</span>
                <span className="text-orange-600">Bước {currentStep} / 3</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-orange-500 h-full transition-all duration-300"
                  style={{ width: `${(currentStep / 3) * 100}%` }}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* BƯỚC 1: CHỈ SỐ CƠ THỂ */}
            {currentStep === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Bước 1: Chỉ số cơ thể</h2>
                  <p className="text-xs text-slate-500">Giúp hệ thống tính toán năng lượng BMR chính xác</p>
                </div>

                <div className="space-y-4">
                  {/* Giới tính */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Giới tính sinh học</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setGender('Male')}
                        className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all min-h-[44px] ${
                          gender === 'Male'
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        Nam (Male)
                      </button>
                      <button
                        type="button"
                        onClick={() => setGender('Female')}
                        className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all min-h-[44px] ${
                          gender === 'Female'
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        Nữ (Female)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Chiều cao (100–250 cm)"
                      type="number"
                      value={heightCm}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      placeholder="170"
                      min={100}
                      max={250}
                      required
                    />

                    <Input
                      label="Cân nặng (25–300 kg)"
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      placeholder="65"
                      min={25}
                      max={300}
                      required
                    />

                    <Input
                      label="Tuổi (10–100)"
                      type="number"
                      value={age}
                      onChange={(e) => setAge(Number(e.target.value))}
                      placeholder="25"
                      min={10}
                      max={100}
                      required
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* BƯỚC 2: VẬN ĐỘNG & MỤC TIÊU */}
            {currentStep === 2 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Bước 2: Vận động & Mục tiêu</h2>
                  <p className="text-xs text-slate-500">Xác định hệ số tiêu hao năng lượng và mục tiêu calo</p>
                </div>

                {/* 5 mức vận động */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase">Mức độ vận động thể chất</label>
                  <div className="space-y-2.5">
                    {ACTIVITY_LEVELS.map((lvl) => (
                      <div
                        key={lvl.value}
                        onClick={() => setActivityLevel(lvl.value)}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between min-h-[44px] ${
                          activityLevel === lvl.value
                            ? 'border-orange-500 bg-orange-50/40 text-slate-900'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-sm flex items-center gap-2">
                            <span>{lvl.label}</span>
                            <span className="text-xs text-orange-600 font-mono">({lvl.factor})</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{lvl.desc}</p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            activityLevel === lvl.value ? 'border-orange-500' : 'border-slate-300'
                          }`}
                        >
                          {activityLevel === lvl.value && <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mục tiêu */}
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase">Mục tiêu sức khỏe</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {GOALS.map((g) => {
                      const isAgeRestricted = age < 16 && g.value === 'LoseFat';
                      return (
                        <div
                          key={g.value}
                          onClick={() => {
                            if (!isAgeRestricted) setGoal(g.value);
                          }}
                          className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between min-h-[44px] ${
                            isAgeRestricted
                              ? 'opacity-40 cursor-not-allowed border-slate-100 bg-slate-50'
                              : goal === g.value
                              ? 'border-orange-500 bg-orange-50/50 cursor-pointer'
                              : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                          }`}
                        >
                          <div>
                            <p className="font-bold text-sm text-slate-900">{g.label}</p>
                            <span className="text-[10px] font-mono font-bold text-orange-600">{g.targetDelta}</span>
                            <p className="text-xs text-slate-500 mt-1">{g.desc}</p>
                          </div>
                          {isAgeRestricted && (
                            <span className="text-[10px] text-red-500 font-bold mt-2">Yêu cầu từ 16 tuổi</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Checkbox Phụ huynh xác nhận cho độ tuổi 10–15 (FR-HLT-002) */}
                {age >= 10 && age <= 15 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                    <p className="text-xs font-bold text-amber-800">Quy định an toàn thanh thiếu niên (10–15 tuổi)</p>
                    <Checkbox
                      id="parentalConsent"
                      checked={parentalConsent}
                      onChange={(e) => setParentalConsent(e.target.checked)}
                      label="Có sự xác nhận và đồng ý của phụ huynh / người giám hộ (Bắt buộc)"
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* BƯỚC 3: DỊ ỨNG & GHI CHÚ KIÊNG KÝ */}
            {currentStep === 3 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div className="text-center space-y-1">
                  <h2 className="text-2xl font-black text-slate-900">Bước 3: Dị ứng & Kiêng kỵ</h2>
                  <p className="text-xs text-slate-500">Món ăn có thành phần dị ứng sẽ bị lọc tuyệt đối khỏi thực đơn</p>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-600 uppercase">Chọn các nguyên liệu dị ứng</label>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_ALLERGENS.map((tag) => {
                      const isSelected = allergies.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleAllergy(tag)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected && <CheckCircle2 size={14} />}
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  {/* Nhập dị ứng tùy chọn khác */}
                  <div className="flex gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Thêm dị ứng khác (ví dụ: Nấm, Mè đen...)"
                      value={customAllergyInput}
                      onChange={(e) => setCustomAllergyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomAllergy();
                        }
                      }}
                      className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    <Button type="button" variant="outline" onClick={handleAddCustomAllergy} className="min-h-[44px]">
                      Thêm
                    </Button>
                  </div>
                </div>

                {/* Ghi chú */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-600 uppercase">Ghi chú khẩu vị & Kiêng kỵ thêm</label>
                  <textarea
                    rows={3}
                    placeholder="Ví dụ: Giảm cay, không ăn hành ngò, ăn ít muối..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </motion.div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-100">
              {currentStep > 1 ? (
                <Button variant="outline" onClick={handleBack} className="min-h-[44px]">
                  <ChevronLeft size={16} className="mr-1" /> Quay lại
                </Button>
              ) : (
                <div />
              )}

              {currentStep < 3 ? (
                <Button onClick={handleNext} className="min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold">
                  Tiếp theo <ChevronRight size={16} className="ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmitSurvey}
                  disabled={isSubmitting}
                  className="min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 shadow-lg shadow-orange-500/25"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="animate-spin" size={16} /> Đang tính chỉ số...
                    </span>
                  ) : (
                    'Lưu và tính chỉ số'
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
