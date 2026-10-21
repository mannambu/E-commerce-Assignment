import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Utensils, ClipboardList,
  LogOut, ShoppingBag, BarChart3, User as UserIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface SidebarProps {
  role?: 'admin' | 'user' | 'Admin' | 'Customer';
}

export default function Sidebar({ role }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Định nghĩa menu cho Khách hàng
  const customerLinks = [
    { icon: LayoutDashboard, label: 'Tổng quan', path: '/dashboard/user' },
    { icon: Utensils, label: 'Gợi ý thực đơn', path: '/dashboard/menu' },
    { icon: ClipboardList, label: 'Nhật ký & Theo dõi', path: '/dashboard/diary' },
    { icon: UserIcon, label: 'Hồ sơ & Địa chỉ', path: '/dashboard/profile' },
  ];

  // 2. Định nghĩa menu cho Admin
  const adminLinks = [
    { icon: LayoutDashboard, label: 'Quản trị hệ thống', path: '/dashboard/admin' },
    { icon: Utensils, label: 'Quản lý thực đơn', path: '/dashboard/admin/menu' },
    { icon: ShoppingBag, label: 'Quản lý đơn hàng', path: '/dashboard/admin/orders' },
    { icon: BarChart3, label: 'Dashboard thống kê', path: '/dashboard/admin/analytics' },
  ];

  const normalizedRole = role?.toLowerCase() === 'admin'
    ? 'Admin'
    : role?.toLowerCase() === 'user' || role === 'Customer'
      ? 'Customer'
      : user?.role;

  // Lựa chọn bộ menu dựa trên Role
  const activeLinks = normalizedRole === 'Admin' ? adminLinks : customerLinks;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-[color:var(--role-border)] bg-[var(--role-surface)]/95 backdrop-blur-md">
      <div className="p-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--role-accent)] shadow-lg shadow-[color:color-mix(in_srgb,var(--role-accent)_28%,transparent)]">
            <Utensils className="text-white" size={20} />
          </div>
          <span className="text-xl font-black text-gray-900 italic">FitBite</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-1">
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
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all min-h-[44px]"
        >
          <LogOut size={20} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
