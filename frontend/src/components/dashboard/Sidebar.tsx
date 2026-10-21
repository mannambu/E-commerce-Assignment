import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Utensils, ClipboardList,
  LogOut, ShoppingBag, BarChart3, Users as UserIcon, Settings, Receipt
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import { waitForSessionRefresh } from '@/services/api';
import { apiError } from '@/lib/admin';

interface SidebarProps {
  role?: 'admin' | 'user' | 'Admin' | 'Customer';
}

export default function Sidebar({ role }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      // AuthContext revokes the session and clears local authentication state.
      await waitForSessionRefresh();
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status === 401) {
        await logout();
        navigate('/login', { replace: true });
      }
      else setLogoutError(apiError(error));
    } finally { setIsLoggingOut(false); }
  };

  // 1. Định nghĩa menu cho Khách hàng
  const customerLinks = [
    { icon: LayoutDashboard, label: 'Tổng quan', path: '/dashboard/user' },
    { icon: Utensils, label: 'Gợi ý thực đơn', path: '/dashboard/menu' },
    { icon: ClipboardList, label: 'Nhật ký & Theo dõi', path: '/dashboard/diary' },
    { icon: UserIcon, label: 'Hồ sơ & Địa chỉ', path: '/dashboard/profile' },
  ];

  // 2. Định nghĩa menu cho Admin
  const adminLinks = [
    { icon: UserIcon, label: 'Quản lý người dùng', path: '/dashboard/admin/users' },
    { icon: LayoutDashboard, label: 'Quản trị hệ thống', path: '/dashboard/admin' },
    { icon: Utensils, label: 'Quản lý thực đơn', path: '/dashboard/admin/menu' },
    { icon: ShoppingBag, label: 'Giám sát đơn hàng', path: '/dashboard/admin/orders' },
    { icon: BarChart3, label: 'Thống kê vận hành', path: '/dashboard/admin/analytics' },
    { icon: Receipt, label: 'Sổ giao dịch', path: '/dashboard/admin/finance/transactions' },
    { icon: ClipboardList, label: 'Nhật ký thực phẩm', path: '/dashboard/admin/food-diary' },
    { icon: Settings, label: 'Giờ chốt bếp', path: '/dashboard/admin/settings' },
  ];

  const normalizedRole = role?.toLowerCase() === 'admin'
    ? 'Admin'
    : role?.toLowerCase() === 'user' || role === 'Customer'
      ? 'Customer'
      : user?.role;

  // Lựa chọn bộ menu dựa trên Role
  const activeLinks = normalizedRole === 'Admin' ? adminLinks : customerLinks;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-[color:var(--role-border)] bg-[var(--role-surface)]/95 backdrop-blur-md">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--role-accent)] shadow-lg shadow-[color:color-mix(in_srgb,var(--role-accent)_28%,transparent)]">
            <Utensils className="text-white" size={20} />
          </div>
          <span className="text-xl font-black text-gray-900 italic">FitBite</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {activeLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              location.pathname === link.path
                ? "bg-[var(--role-accent-soft)] text-[color:var(--role-accent)]"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <link.icon size={20} />
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-50">
        {logoutError && <p role="alert" className="text-xs text-red-600 mb-2">{logoutError}</p>}
        <button 
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all min-h-[44px]"
        >
          <LogOut size={20} />
          {isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
        </button>
      </div>
    </aside>
  );
}
