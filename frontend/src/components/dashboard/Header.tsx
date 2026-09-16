import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Search, Bell, ChevronDown, User, Settings, LogOut, ShoppingCart, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/services/api';

interface HeaderProps {
  title: string;
  userName?: string;
  userRole?: string;
  avatar?: string;
  hideSearch?: boolean;
}

type NotificationItem = {
  _id?: string;
  type?: 'Order' | 'Chat' | 'System';
  message?: string;
  read?: boolean;
  createdAt?: string;
};

type CurrentProfile = {
  _id?: string;
  email?: string;
  username?: string;
  phone?: string;
  role?: 'Customer' | 'PT' | 'Admin';
  account_status?: 'Active' | 'Pending' | 'Locked';
  created_at?: string;
  updated_at?: string;
  date_of_birth?: string;
  avatar?: string;
  notifications?: NotificationItem[];
  healthProfile?: {
    gender?: 'Male' | 'Female';
    age?: number;
    heightCm?: number;
    weightKg?: number;
    activityLevel?: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active';
    goal?: 'LoseFat' | 'GainMuscle' | 'MaintainWeight';
    allergies?: string[];
    bmr?: number;
    tdee?: number;
    targetCalories?: number;
    macroDistribution?: {
      protein?: number;
      carb?: number;
      fat?: number;
    };
  };
  ptProfile?: {
    experienceYears?: number;
    specialties?: string[];
    portfolioImages?: string[];
    rating?: number;
    approvedByAdmin?: boolean;
  };
  registeredPTServices?: Array<unknown>;
};

export default function Header({ title, userName, userRole, avatar, hideSearch = false }: HeaderProps) {
  const navigate = useNavigate();
  const { items } = useCart();
  const { user, logout } = useAuth();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDateOfBirth, setFormDateOfBirth] = useState('');

  const [formExperienceYears, setFormExperienceYears] = useState('');
  const [formSpecialties, setFormSpecialties] = useState('');
  const [formPortfolioImages, setFormPortfolioImages] = useState('');
  const [formGender, setFormGender] = useState<'Male' | 'Female'>('Male');
  const [formAge, setFormAge] = useState('');
  const [formHeightCm, setFormHeightCm] = useState('');
  const [formWeightKg, setFormWeightKg] = useState('');
  const [formActivityLevel, setFormActivityLevel] = useState<'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active'>('Moderate');
  const [formGoal, setFormGoal] = useState<'LoseFat' | 'GainMuscle' | 'MaintainWeight'>('MaintainWeight');
  const [formAllergies, setFormAllergies] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const fetchMe = async () => {
    try {
      const res = await api.get('/users/me');
      const me = res.data?.result || null;
      setProfile(me);
    } catch (error) {
      console.error('Không thể tải dữ liệu header:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchMe();
    }
  }, [user]);

  useEffect(() => {
    if (!showSettingsModal || !profile) return;

    setFormUsername(profile.username || '');
    setFormPhone(profile.phone || '');
    setFormDateOfBirth(profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : '');

    setFormExperienceYears(String(profile.ptProfile?.experienceYears ?? ''));
    setFormSpecialties((profile.ptProfile?.specialties || []).join(', '));
    setFormPortfolioImages((profile.ptProfile?.portfolioImages || []).join(', '));

    setFormGender(profile.healthProfile?.gender || 'Male');
    setFormAge(profile.healthProfile?.age ? String(profile.healthProfile.age) : '');
    setFormHeightCm(profile.healthProfile?.heightCm ? String(profile.healthProfile.heightCm) : '');
    setFormWeightKg(profile.healthProfile?.weightKg ? String(profile.healthProfile.weightKg) : '');
    setFormActivityLevel(profile.healthProfile?.activityLevel || 'Moderate');
    setFormGoal(profile.healthProfile?.goal || 'MaintainWeight');
    setFormAllergies((profile.healthProfile?.allergies || []).join(', '));
    setAvatarFile(null);
    setAvatarPreview(profile.avatar || null);
    setRemoveAvatar(false);

    setSettingsError(null);
  }, [showSettingsModal, profile]);

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSettingsError('Vui lòng chọn file ảnh hợp lệ.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setSettingsError('Ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    setSettingsError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setRemoveAvatar(false);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setRemoveAvatar(true);
    setSettingsError(null);
  };

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  const effectiveRole = useMemo(() => {
    if (userRole) return userRole;
    const role = profile?.role || user?.role;
    if (role === 'Admin') return 'Quản trị viên';
    if (role === 'PT') return 'Huấn luyện viên';
    return 'Người dùng';
  }, [profile?.role, user?.role, userRole]);

  const effectiveName = userName || profile?.username || user?.username || 'Người dùng';
  const effectiveEmail = profile?.email || 'N/A';
  const effectiveAvatar = profile?.avatar || avatar || 'https://i.pravatar.cc/150?u=fitbite';

  const roleCode = profile?.role || user?.role;
  const isCustomer = roleCode === 'Customer';
  const isPT = roleCode === 'PT';
  const hasHealthProfile = Boolean(profile?.healthProfile);

  const notifications = profile?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        await api.post('/users/logout', { refresh_token: refreshToken });
      }
    } catch (error) {
      console.error('Logout API lỗi, sẽ logout local:', error);
    } finally {
      logout();
      localStorage.removeItem('userRole');
      navigate('/login');
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      setSettingsError(null);

      let avatarPayload: string | null | undefined = undefined;

      if (avatarFile) {
        const formData = new FormData();
        formData.append('image', avatarFile);

        const uploadRes = await api.post('/medias/upload-image', formData);

        const uploadedUrl = uploadRes.data?.result?.[0];
        if (!uploadedUrl || typeof uploadedUrl !== 'string') {
          throw new Error('Không nhận được URL ảnh sau khi upload.');
        }
        avatarPayload = uploadedUrl;
      } else if (removeAvatar) {
        avatarPayload = null;
      }

      const updatePayload: {
        username: string;
        phone: string;
        date_of_birth?: string;
        avatar?: string | null;
      } = {
        username: formUsername.trim(),
        phone: formPhone.trim()
      };

      if (formDateOfBirth) {
        updatePayload.date_of_birth = formDateOfBirth;
      }

      if (avatarPayload !== undefined) {
        updatePayload.avatar = avatarPayload;
      }

      let profileUpdateRes = await api.patch('/users/me', updatePayload);

      const updatedProfile = profileUpdateRes.data?.result;

      // Fallback đồng bộ avatar: nếu backend response chưa phản ánh đúng avatar vừa lưu, gửi lại avatar riêng.
      if (avatarPayload !== undefined && updatedProfile?.avatar !== avatarPayload) {
        profileUpdateRes = await api.patch('/users/me', { avatar: avatarPayload });
      }

      const finalUpdatedProfile = profileUpdateRes.data?.result;
      if (finalUpdatedProfile) {
        setProfile(finalUpdatedProfile);
      }

      const canUpdateHealthProfile =
        formAge.trim() !== '' &&
        formHeightCm.trim() !== '' &&
        formWeightKg.trim() !== '';

      const followUpTasks: Promise<unknown>[] = [];
      let hasFollowUpFailure = false;

      if (canUpdateHealthProfile) {
        const allergies = formAllergies
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        followUpTasks.push(
          api.post('/users/health-profile', {
            gender: formGender,
            age: Number(formAge),
            heightCm: Number(formHeightCm),
            weightKg: Number(formWeightKg),
            activityLevel: formActivityLevel,
            goal: formGoal,
            allergies
          })
        );
      }

      if (isPT) {
        const specialties = formSpecialties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        const portfolioImages = formPortfolioImages
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

        followUpTasks.push(
          api.patch('/users/me/pt-profile', {
            experienceYears: Number(formExperienceYears || 0),
            specialties,
            portfolioImages
          })
        );
      }

      if (followUpTasks.length > 0) {
        const settled = await Promise.allSettled(followUpTasks);
        const hasFailedTask = settled.some((item) => item.status === 'rejected');
        if (hasFailedTask) {
          hasFollowUpFailure = true;
          setSettingsError('Ảnh/hồ sơ cơ bản đã được cập nhật, nhưng một số thông tin mở rộng chưa lưu được. Vui lòng kiểm tra lại dữ liệu.');
        }
      }

      await fetchMe();
      window.dispatchEvent(new Event('fitbite-profile-updated'));
      if (!hasFollowUpFailure) {
        setShowSettingsModal(false);
      }
    } catch (error: any) {
      setSettingsError(error?.response?.data?.message || 'Không thể lưu cài đặt tài khoản.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-[color:var(--role-border)] bg-[var(--role-surface)]/80 px-8 backdrop-blur-md">
        <h1 className="text-2xl font-black text-gray-900">{title}</h1>

        <div className="flex items-center gap-6">
          {!hideSearch && (
            <div className="relative group hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-[color:var(--role-accent)]" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                className="w-64 rounded-xl border border-gray-100 bg-white py-2 pl-10 pr-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--role-accent)_28%,white)]"
              />
            </div>
          )}

          {isCustomer && (
            <Link to="/cart" className="relative p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all">
              <ShoppingCart size={22} />
              {items.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--role-accent)] text-[10px] font-black text-white">
                  {items.length}
                </span>
              )}
            </Link>
          )}

          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
              className={cn(
                'relative p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all',
                showNotifications && 'bg-gray-100 text-gray-900'
              )}
            >
              <Bell size={22} />
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>

            {showNotifications && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50">
                <div className="p-3 border-b border-gray-50">
                  <h3 className="font-black text-gray-900">Thông báo</h3>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-xs font-medium text-gray-500 text-center">Chưa có thông báo nào.</p>
                  ) : (
                    notifications.map((n, idx) => (
                      <div key={n._id || idx} className="p-3 hover:bg-gray-50 rounded-xl transition-colors">
                        <p className="text-xs font-bold text-gray-900">{n.type || 'System'}</p>
                        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">{n.message || 'Thông báo hệ thống'}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleString('vi-VN') : ''}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                setShowNotifications(false);
              }}
              className={cn(
                'flex items-center gap-3 pl-4 border-l border-gray-100 group cursor-pointer hover:bg-gray-50 p-1 rounded-xl transition-all',
                showProfileMenu && 'bg-gray-50'
              )}
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-900 transition-colors uppercase">{effectiveName}</p>
                <p className="text-[10px] font-bold uppercase tracking-tighter text-[color:var(--role-accent)]">{effectiveRole}</p>
              </div>
              <div className="relative">
                <img src={effectiveAvatar} alt="Avatar" className="w-10 h-10 rounded-xl object-cover" />
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-gray-100">
                  <ChevronDown size={10} className={cn('text-gray-400 transition-transform', showProfileMenu && 'rotate-180')} />
                </div>
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50">
                <div className="p-3 border-b border-gray-50">
                  <p className="text-xs font-bold text-gray-900">{effectiveName}</p>
                  <p className="text-[10px] text-gray-400 font-medium">{effectiveEmail}</p>
                </div>
                <div className="py-2">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowProfileModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
                  >
                    <User size={16} className="text-gray-600" />
                    <span className="text-xs font-bold text-gray-700">Hồ sơ của tôi</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowSettingsModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
                  >
                    <Settings size={16} className="text-gray-600" />
                    <span className="text-xs font-bold text-gray-700">Cài đặt tài khoản</span>
                  </button>
                </div>
                <div className="pt-2 border-t border-gray-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors text-left"
                  >
                    <LogOut size={16} />
                    <span className="text-xs font-bold">Đăng xuất</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showProfileModal && (
        <Modal title="Hồ sơ của tôi" onClose={() => setShowProfileModal(false)}>
          <div className="space-y-3 text-sm">
            <Row label="ID" value={profile?._id || 'N/A'} />
            <Row label="Tên người dùng" value={profile?.username || 'N/A'} />
            <Row label="Email" value={profile?.email || 'N/A'} />
            <Row label="Số điện thoại" value={profile?.phone || 'N/A'} />
            <Row label="Vai trò" value={effectiveRole} />
            <Row label="Trạng thái tài khoản" value={profile?.account_status || 'N/A'} />
            <Row label="Ngày sinh" value={profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'} />
            <Row label="Ngày tạo" value={profile?.created_at ? new Date(profile.created_at).toLocaleString('vi-VN') : 'N/A'} />
            <Row label="Cập nhật gần nhất" value={profile?.updated_at ? new Date(profile.updated_at).toLocaleString('vi-VN') : 'N/A'} />

            <div className="pt-2">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Hồ sơ sức khỏe</p>
              <Row label="Giới tính" value={profile?.healthProfile?.gender || 'Chưa cập nhật'} />
              <Row label="Tuổi" value={profile?.healthProfile?.age ? String(profile.healthProfile.age) : 'Chưa cập nhật'} />
              <Row label="Chiều cao" value={profile?.healthProfile?.heightCm ? `${profile.healthProfile.heightCm} cm` : 'Chưa cập nhật'} />
              <Row label="Cân nặng" value={profile?.healthProfile?.weightKg ? `${profile.healthProfile.weightKg} kg` : 'Chưa cập nhật'} />
              <Row label="Mức vận động" value={mapActivityLabel(profile?.healthProfile?.activityLevel)} />
              <Row label="Mục tiêu hiện tại" value={mapGoalLabel(profile?.healthProfile?.goal)} />
              <Row
                label="Dị ứng"
                value={profile?.healthProfile?.allergies && profile.healthProfile.allergies.length > 0 ? profile.healthProfile.allergies.join(', ') : 'Không có'}
              />
              <Row label="BMR" value={profile?.healthProfile?.bmr ? `${profile.healthProfile.bmr} kcal` : 'N/A'} />
              <Row label="TDEE" value={profile?.healthProfile?.tdee ? `${profile.healthProfile.tdee} kcal` : 'N/A'} />
              <Row label="Target Calories" value={profile?.healthProfile?.targetCalories ? `${profile.healthProfile.targetCalories} kcal` : 'N/A'} />
              <Row
                label="Macro"
                value={profile?.healthProfile?.macroDistribution
                  ? `P:${profile.healthProfile.macroDistribution.protein || 0} C:${profile.healthProfile.macroDistribution.carb || 0} F:${profile.healthProfile.macroDistribution.fat || 0}`
                  : 'N/A'}
              />
            </div>

            {isPT ? (
              <div className="pt-2">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">PT Profile</p>
                <Row label="Kinh nghiệm" value={profile?.ptProfile?.experienceYears ? `${profile.ptProfile.experienceYears} năm` : 'Chưa cập nhật'} />
                <Row label="Đánh giá" value={profile?.ptProfile?.rating ? profile.ptProfile.rating.toFixed(1) : 'N/A'} />
                <Row label="Đã duyệt" value={profile?.ptProfile?.approvedByAdmin ? 'Đã duyệt' : 'Chưa duyệt'} />
                <Row
                  label="Chuyên môn"
                  value={profile?.ptProfile?.specialties && profile.ptProfile.specialties.length > 0 ? profile.ptProfile.specialties.join(', ') : 'Chưa cập nhật'}
                />
              </div>
            ) : null}

            {isCustomer ? (
              <div className="pt-2">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Thông tin khách hàng</p>
                <Row label="Số gói PT đã đăng ký" value={String(profile?.registeredPTServices?.length || 0)} />
              </div>
            ) : null}

          </div>
          <div className="pt-4 flex justify-end">
            <Button onClick={() => setShowProfileModal(false)} className="rounded-xl">Đóng</Button>
          </div>
        </Modal>
      )}

      {showSettingsModal && (
        <Modal title="Cài đặt tài khoản" onClose={() => setShowSettingsModal(false)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-black text-gray-900 mb-3">Ảnh đại diện</p>
              <div className="flex items-center gap-4 flex-wrap">
                <img
                  src={avatarPreview || effectiveAvatar}
                  alt="Avatar preview"
                  className="w-16 h-16 rounded-2xl object-cover border border-gray-200"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors">
                    Chọn ảnh
                    <input type="file" accept="image/*" onChange={handleAvatarFileChange} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center px-4 h-10 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Xóa ảnh đại diện
                  </button>
                </div>
                <p className="text-xs text-gray-500">Định dạng ảnh, tối đa 5MB. Ảnh sẽ upload lên Cloudinary.</p>
              </div>
            </div>

            <Input label="Tên người dùng" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
            <Input label="Số điện thoại" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
            <Input label="Ngày sinh" type="date" value={formDateOfBirth} onChange={(e) => setFormDateOfBirth(e.target.value)} />

            <div className="pt-1 border-t border-gray-100" />
            <p className="text-xs font-black text-gray-500 uppercase tracking-wider">
              Hồ sơ sức khỏe {hasHealthProfile ? '(đang có dữ liệu)' : '(chưa thiết lập)'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Giới tính</label>
                <select
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value as 'Male' | 'Female')}
                  className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                >
                  <option value="Male">Nam</option>
                  <option value="Female">Nữ</option>
                </select>
              </div>
              <Input label="Tuổi" type="number" value={formAge} onChange={(e) => setFormAge(e.target.value)} />
              <Input label="Chiều cao (cm)" type="number" value={formHeightCm} onChange={(e) => setFormHeightCm(e.target.value)} />
              <Input label="Cân nặng (kg)" type="number" value={formWeightKg} onChange={(e) => setFormWeightKg(e.target.value)} />

              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Mức vận động</label>
                <select
                  value={formActivityLevel}
                  onChange={(e) => setFormActivityLevel(e.target.value as 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active')}
                  className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                >
                  <option value="Sedentary">Ít vận động</option>
                  <option value="Light">Vận động nhẹ</option>
                  <option value="Moderate">Vận động vừa</option>
                  <option value="Active">Vận động nhiều</option>
                  <option value="Very Active">Vận động rất nhiều</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Mục tiêu hiện tại</label>
                <select
                  value={formGoal}
                  onChange={(e) => setFormGoal(e.target.value as 'LoseFat' | 'GainMuscle' | 'MaintainWeight')}
                  className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                >
                  <option value="LoseFat">Giảm mỡ</option>
                  <option value="GainMuscle">Tăng cơ</option>
                  <option value="MaintainWeight">Duy trì cân nặng</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-gray-700">Dị ứng/kiêng (cách nhau bởi dấu phẩy)</label>
              <textarea
                value={formAllergies}
                onChange={(e) => setFormAllergies(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                rows={2}
              />
            </div>

            {isPT ? (
              <>
                <Input
                  label="Số năm kinh nghiệm"
                  type="number"
                  value={formExperienceYears}
                  onChange={(e) => setFormExperienceYears(e.target.value)}
                />
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Chuyên môn (cách nhau bởi dấu phẩy)</label>
                  <textarea
                    value={formSpecialties}
                    onChange={(e) => setFormSpecialties(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-gray-700">Portfolio URLs (cách nhau bởi dấu phẩy)</label>
                  <textarea
                    value={formPortfolioImages}
                    onChange={(e) => setFormPortfolioImages(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                    rows={3}
                  />
                </div>
              </>
            ) : null}

            {settingsError ? <p className="text-sm font-medium text-red-500">{settingsError}</p> : null}
          </div>
          <div className="pt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSettingsModal(false)} className="rounded-xl">Hủy</Button>
            <Button onClick={handleSaveSettings} disabled={isSaving} className="rounded-xl">
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="text-xl font-black text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-4 max-h-[calc(90vh-88px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2 border-b border-gray-50">
      <span className="text-gray-500 font-medium">{label}</span>
      <span className="text-gray-900 font-bold text-right">{value}</span>
    </div>
  );
}

function mapGoalLabel(goal?: 'LoseFat' | 'GainMuscle' | 'MaintainWeight') {
  if (goal === 'LoseFat') return 'Giảm mỡ';
  if (goal === 'GainMuscle') return 'Tăng cơ';
  if (goal === 'MaintainWeight') return 'Duy trì cân nặng';
  return 'Chưa thiết lập';
}

function mapActivityLabel(activity?: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active') {
  if (activity === 'Sedentary') return 'Ít vận động';
  if (activity === 'Light') return 'Vận động nhẹ';
  if (activity === 'Moderate') return 'Vận động vừa';
  if (activity === 'Active') return 'Vận động nhiều';
  if (activity === 'Very Active') return 'Vận động rất nhiều';
  return 'Chưa thiết lập';
}
