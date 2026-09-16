import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Menu, X, Utensils, Users, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { cartCount } = useCart();
  const { user, isAuthenticated, logout } = useAuth();

  const navLinks = [
    { name: 'Thực đơn', path: '/food-catalog', icon: <Utensils size={18} /> },
    { name: 'Huấn luyện viên', path: '/pt-directory', icon: <Users size={18} /> },
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
  ];

  const dashboardPath =
    user?.role === 'Admin'
      ? '/dashboard/admin'
      : user?.role === 'PT'
      ? '/dashboard/pt-view'
      : '/dashboard/user';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                <Utensils size={20} />
              </div>
              <span className="text-2xl font-black tracking-tighter text-gray-900 hidden sm:block">FitBite</span>
            </Link>
            <div className="hidden md:ml-8 md:flex md:space-x-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={cn(
                    "inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                    location.pathname === link.path 
                      ? "text-orange-500 bg-orange-50" 
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <span className="mr-2">{link.icon}</span>
                  {link.name}
                </Link>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link to="/cart" className="relative p-2 text-gray-500 hover:text-orange-500 transition-colors">
              <ShoppingCart size={24} />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-[10px] font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-orange-500 rounded-full">
                  {cartCount}
                </span>
              )}
            </Link>
            {isAuthenticated ? (
              <>
                <Link to={dashboardPath}>
                  <Button variant="ghost" size="sm" className="hidden sm:flex">
                    Dashboard
                  </Button>
                </Link>
                <Button size="sm" className="hidden sm:flex" onClick={handleLogout}>
                  Đăng xuất
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="hidden sm:flex">
                    Đăng nhập
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" className="hidden sm:flex">
                    Đăng ký
                  </Button>
                </Link>
              </>
            )}
            <div className="md:hidden">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-gray-500 hover:text-gray-900"
              >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 p-4 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setIsOpen(false)}
              className={cn(
                "flex items-center px-4 py-3 text-base font-medium rounded-xl",
                location.pathname === link.path 
                  ? "text-orange-500 bg-orange-50" 
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              )}
            >
              <span className="mr-3">{link.icon}</span>
              {link.name}
            </Link>
          ))}
          <div className="pt-4 flex gap-2">
            {isAuthenticated ? (
              <>
                <Link to={dashboardPath} className="flex-1" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl">Dashboard</Button>
                </Link>
                <Button
                  className="flex-1 rounded-xl"
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                >
                  Đăng xuất
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="flex-1">
                  <Button variant="outline" className="w-full rounded-xl">Đăng nhập</Button>
                </Link>
                <Link to="/register" className="flex-1">
                  <Button className="w-full rounded-xl">Đăng ký</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
