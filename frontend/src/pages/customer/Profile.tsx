import { useState, useEffect, type ChangeEvent } from 'react';
import { motion } from 'motion/react';
import {
  User as UserIcon,
  Mail,
  Phone,
  Calendar,
  ShieldCheck,
  MapPin,
  Plus,
  Trash2,
  CheckCircle2,
  Edit2,
  Star,
  LogOut,
  Lock,
  Loader2,
  AlertCircle,
  Camera,
  ArrowLeft,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Sidebar from '@/components/dashboard/Sidebar';
import Header from '@/components/dashboard/Header';
import { useAuth, UserAddress } from '@/context/AuthContext';
import api from '@/services/api';

export default function Profile() {
  const { user, logout, logoutAll, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Profile Form state
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);
  const [profileErrorMsg, setProfileErrorMsg] = useState<string | null>(null);

  // Address Book state
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrName, setAddrName] = useState('');
  const [addrPhone, setAddrPhone] = useState('');
  const [addrDetail, setAddrDetail] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(false);
  const [isSavingAddresses, setIsSavingAddresses] = useState(false);
  const [addressErrorMsg, setAddressErrorMsg] = useState<string | null>(null);

  // Password Change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  // Populate data from user
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setPhone(user.phone || '');
      setDateOfBirth(user.date_of_birth ? String(user.date_of_birth).slice(0, 10) : '');
      setAvatarPreview(user.avatar || null);
      setAddresses(user.addresses || []);
    }
  }, [user]);

  // Handle Avatar Change
  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileErrorMsg('Vui lòng chọn định dạng file ảnh hợp lệ');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileErrorMsg('Kích thước ảnh tối đa 5MB');
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setProfileErrorMsg(null);
  };

  // Submit Profile update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileSuccessMsg(null);
    setProfileErrorMsg(null);

    try {
      let finalAvatarUrl = user?.avatar;

      // Upload avatar nếu có file mới
      if (avatarFile) {
        const formData = new FormData();
        formData.append('image', avatarFile);
        const uploadRes = await api.post('/medias/upload-image', formData);
        const uploaded = uploadRes.data?.result?.[0];
        if (uploaded) {
          finalAvatarUrl = uploaded;
        }
      }

      const payload: any = {
        username: username.trim(),
        phone: phone.trim(),
      };
      if (dateOfBirth) payload.date_of_birth = dateOfBirth;
      if (finalAvatarUrl !== undefined) payload.avatar = finalAvatarUrl;

      await api.patch('/users/me', payload);
      await refreshUser();
      setProfileSuccessMsg('Cập nhật thông tin hồ sơ thành công!');
      window.dispatchEvent(new Event('fitbite-profile-updated'));
    } catch (err: any) {
      setProfileErrorMsg(err.response?.data?.message || 'Không thể cập nhật hồ sơ');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Open modal to add address
  const handleOpenAddAddress = () => {
    setEditingAddressId(null);
    setAddrName(user?.username || '');
    setAddrPhone(user?.phone || '');
    setAddrDetail('');
    setAddrIsDefault(addresses.length === 0);
    setAddressErrorMsg(null);
    setShowAddressModal(true);
  };

  // Open modal to edit address
  const handleOpenEditAddress = (addr: UserAddress) => {
    setEditingAddressId(addr._id || null);
    setAddrName(addr.name);
    setAddrPhone(addr.phone);
    setAddrDetail(addr.address);
    setAddrIsDefault(addr.isDefault);
    setAddressErrorMsg(null);
    setShowAddressModal(true);
  };

  // Save Address (Create or Update)
  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrName.trim() || !addrPhone.trim() || !addrDetail.trim()) {
      setAddressErrorMsg('Vui lòng điền đầy đủ thông tin địa chỉ');
      return;
    }

    setIsSavingAddresses(true);
    setAddressErrorMsg(null);

    try {
      let updatedAddresses: UserAddress[];

      if (editingAddressId) {
        // Cập nhật địa chỉ đã có
        updatedAddresses = addresses.map((a) => {
          if (a._id === editingAddressId) {
            return {
              ...a,
              name: addrName.trim(),
              phone: addrPhone.trim(),
              address: addrDetail.trim(),
              isDefault: addrIsDefault,
            };
          }
          return addrIsDefault ? { ...a, isDefault: false } : a;
        });
      } else {
        // Thêm địa chỉ mới
        const newAddr: UserAddress = {
          _id: Date.now().toString(),
          name: addrName.trim(),
          phone: addrPhone.trim(),
          address: addrDetail.trim(),
          isDefault: addrIsDefault || addresses.length === 0,
        };

        if (newAddr.isDefault) {
          updatedAddresses = [newAddr, ...addresses.map((a) => ({ ...a, isDefault: false }))];
        } else {
          updatedAddresses = [...addresses, newAddr];
        }
      }

      // Đảm bảo luôn có đúng 1 địa chỉ mặc định
      const hasDefault = updatedAddresses.some((a) => a.isDefault);
      if (!hasDefault && updatedAddresses.length > 0) {
        updatedAddresses[0].isDefault = true;
      }

      await api.patch('/users/me', { addresses: updatedAddresses });
      await refreshUser();
      setAddresses(updatedAddresses);
      setShowAddressModal(false);
    } catch (err: any) {
      setAddressErrorMsg(err.response?.data?.message || 'Không thể lưu địa chỉ');
    } finally {
      setIsSavingAddresses(false);
    }
  };

  // Set an address as default
  const handleSetDefaultAddress = async (targetId?: string) => {
    if (!targetId) return;
    try {
      const updated = addresses.map((a) => ({
        ...a,
        isDefault: a._id === targetId,
      }));
      await api.patch('/users/me', { addresses: updated });
      await refreshUser();
      setAddresses(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể đặt làm địa chỉ mặc định');
    }
  };

  // Delete an address
  const handleDeleteAddress = async (targetId?: string) => {
    if (!targetId) return;
    const target = addresses.find((a) => a._id === targetId);
    if (target?.isDefault && addresses.length > 1) {
      alert('Đây là địa chỉ mặc định. Vui lòng chọn địa chỉ khác làm mặc định trước khi xóa.');
      return;
    }
    if (!confirm('Bạn có chắc chắn muốn xóa địa chỉ này?')) return;

    try {
      const updated = addresses.filter((a) => a._id !== targetId);
      if (updated.length > 0 && !updated.some((a) => a.isDefault)) {
        updated[0].isDefault = true;
      }
      await api.patch('/users/me', { addresses: updated });
      await refreshUser();
      setAddresses(updated);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể xóa địa chỉ');
    }
  };

  // Change password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordErrorMsg('Vui lòng nhập đầy đủ các trường mật khẩu');
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 50) {
      setPasswordErrorMsg('Mật khẩu mới phải từ 8 đến 50 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsChangingPassword(true);
    setPasswordSuccessMsg(null);
    setPasswordErrorMsg(null);

    try {
      await api.patch('/users/me', {
        old_password: oldPassword,
        password: newPassword,
        confirm_password: confirmPassword,
      });
      setPasswordSuccessMsg('Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordErrorMsg(err.response?.data?.message || 'Đổi mật khẩu thất bại');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Logout actions
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleLogoutAll = async () => {
    if (!confirm('Bạn có chắc muốn đăng xuất khỏi tất cả các thiết bị?')) return;
    await logoutAll();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen bg-[#fafafa] overflow-hidden">
      <Sidebar role="Customer" />

      <div className="flex-1 flex flex-col h-screen overflow-y-auto min-w-0">
        <Header title="Hồ sơ cá nhân & Cài đặt" />

        <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Top greeting banner */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-orange-500/20 flex flex-col sm:flex-row items-center gap-6 justify-between">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <img
                  src={avatarPreview || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                  alt="Avatar"
                  className="w-20 h-20 rounded-2xl object-cover border-4 border-white/30 shadow-md"
                />
                <label className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="text-white" size={22} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black">{user?.username || 'Khách hàng FitBite'}</h1>
                <p className="text-orange-100 text-sm mt-1 flex items-center gap-2">
                  <Mail size={14} /> {user?.email}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 text-xs font-bold backdrop-blur-sm">
                  <ShieldCheck size={14} /> Trạng thái: {user?.account_status === 'Active' ? 'Đang hoạt động' : 'Tạm khóa'}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/30 min-h-[44px]"
                onClick={handleLogout}
              >
                <LogOut size={16} className="mr-2" /> Đăng xuất
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 cols: Profile info + Address Book */}
            <div className="lg:col-span-2 space-y-8">
              {/* Form 1: Thông tin cá nhân */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
                    <UserIcon className="text-orange-500" size={22} />
                    <span>Thông tin cá nhân</span>
                  </div>
                  <span className="text-xs text-gray-400">Cập nhật thông tin nhận hàng & liên hệ</span>
                </div>

                {profileSuccessMsg && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-700 text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>{profileSuccessMsg}</span>
                  </div>
                )}
                {profileErrorMsg && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <span>{profileErrorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Tên người dùng (Họ và tên)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Ví dụ: Huy Phúc"
                      icon={<UserIcon size={18} />}
                      required
                    />
                    <Input
                      label="Email (Chỉ đọc)"
                      value={user?.email || ''}
                      disabled
                      icon={<Mail size={18} />}
                      className="bg-gray-50 text-gray-500 cursor-not-allowed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Số điện thoại"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0901234567"
                      icon={<Phone size={18} />}
                    />
                    <Input
                      label="Ngày sinh"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      icon={<Calendar size={18} />}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={isSavingProfile} className="min-h-[44px]">
                      {isSavingProfile ? (
                        <>
                          <Loader2 className="animate-spin mr-2" size={16} /> Đang lưu...
                        </>
                      ) : (
                        'Lưu thông tin'
                      )}
                    </Button>
                  </div>
                </form>
              </div>

              {/* Form 2: Sổ địa chỉ giao hàng (US-32) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div className="flex items-center gap-2 text-gray-900 font-bold text-lg">
                    <MapPin className="text-orange-500" size={22} />
                    <span>Sổ địa chỉ giao hàng</span>
                  </div>
                  <Button size="sm" onClick={handleOpenAddAddress} className="rounded-xl min-h-[40px]">
                    <Plus size={16} className="mr-1" /> Thêm địa chỉ mới
                  </Button>
                </div>

                {addresses.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 space-y-3">
                    <MapPin size={40} className="mx-auto text-gray-300" />
                    <p className="text-sm">Bạn chưa có địa chỉ giao hàng nào.</p>
                    <Button variant="outline" size="sm" onClick={handleOpenAddAddress}>
                      Thêm địa chỉ ngay
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((addr) => (
                      <div
                        key={addr._id || addr.address}
                        className={`p-5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                          addr.isDefault
                            ? 'border-orange-500 bg-orange-50/30'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{addr.name}</span>
                            <span className="text-gray-400 text-sm">|</span>
                            <span className="text-gray-600 text-sm font-medium">{addr.phone}</span>
                            {addr.isDefault && (
                              <span className="px-2.5 py-0.5 bg-orange-500 text-white rounded-full text-xs font-bold inline-flex items-center gap-1">
                                <Star size={12} fill="currentColor" /> Mặc định
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-1">
                            <MapPin size={15} className="text-gray-400 flex-shrink-0" /> {addr.address}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {!addr.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-orange-600 hover:text-orange-700"
                              onClick={() => handleSetDefaultAddress(addr._id)}
                            >
                              Đặt mặc định
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-2 text-gray-500 hover:text-gray-900"
                            onClick={() => handleOpenEditAddress(addr)}
                            aria-label="Sửa địa chỉ"
                          >
                            <Edit2 size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteAddress(addr._id)}
                            aria-label="Xóa địa chỉ"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right 1 col: Password change & Session actions */}
            <div className="space-y-8">
              {/* Đổi mật khẩu */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-4">
                  <Lock className="text-orange-500" size={22} />
                  <span>Đổi mật khẩu</span>
                </div>

                {passwordSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>{passwordSuccessMsg}</span>
                  </div>
                )}
                {passwordErrorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{passwordErrorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <Input
                    label="Mật khẩu hiện tại"
                    type="password"
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                  />
                  <Input
                    label="Mật khẩu mới (8-50 ký tự)"
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <Input
                    label="Xác nhận mật khẩu mới"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />

                  <Button type="submit" disabled={isChangingPassword} className="w-full min-h-[44px]">
                    {isChangingPassword ? (
                      <>
                        <Loader2 className="animate-spin mr-2" size={16} /> Đang cập nhật...
                      </>
                    ) : (
                      'Cập nhật mật khẩu'
                    )}
                  </Button>
                </form>
              </div>

              {/* Quản lý phiên đăng nhập */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-lg border-b border-gray-100 pb-3">
                  <ShieldCheck className="text-orange-500" size={22} />
                  <span>Bảo mật & Phiên</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Đăng xuất khỏi tất cả thiết bị khác nếu bạn nghi ngờ tài khoản bị truy cập trái phép.
                </p>
                <div className="space-y-2 pt-2">
                  <Button
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 min-h-[44px]"
                    onClick={handleLogoutAll}
                  >
                    <LogOut size={16} className="mr-2" /> Đăng xuất khỏi mọi thiết bị
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modal Thêm / Sửa Địa chỉ */}
      {showAddressModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-lg text-gray-900">
                {editingAddressId ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ giao hàng mới'}
              </h3>
              <button
                onClick={() => setShowAddressModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {addressErrorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{addressErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAddress} className="space-y-4">
              <Input
                label="Tên người nhận"
                value={addrName}
                onChange={(e) => setAddrName(e.target.value)}
                placeholder="Ví dụ: Huy Phúc"
                required
              />
              <Input
                label="Số điện thoại người nhận"
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                placeholder="Ví dụ: 0901234567"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ chi tiết</label>
                <textarea
                  value={addrDetail}
                  onChange={(e) => setAddrDetail(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành..."
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addrDefault"
                  checked={addrIsDefault}
                  onChange={(e) => setAddrIsDefault(e.target.checked)}
                  className="rounded text-orange-500 focus:ring-orange-500"
                />
                <label htmlFor="addrDefault" className="text-sm text-gray-700 cursor-pointer">
                  Đặt làm địa chỉ nhận hàng mặc định
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddressModal(false)}
                  className="min-h-[44px]"
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSavingAddresses} className="min-h-[44px]">
                  {isSavingAddresses ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={16} /> Đang lưu...
                    </>
                  ) : (
                    'Lưu địa chỉ'
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
