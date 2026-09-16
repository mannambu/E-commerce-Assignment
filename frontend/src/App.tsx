import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { Loader2 } from 'lucide-react';

// ==================== Lazy Load Pages ====================
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));

const Home = lazy(() => import('./pages/customer/Home'));
const HealthSurvey = lazy(() => import('./pages/customer/HealthSurvey'));
const Dashboard = lazy(() => import('./pages/customer/Dashboard'));

const UserDashboard = lazy(() => import('./pages/dashboard/UserDashboard'));
const UserMenu = lazy(() => import('./pages/dashboard/user/UserMenu'));
const UserDiary = lazy(() => import('./pages/dashboard/user/UserDiary'));
const UserPT = lazy(() => import('./pages/dashboard/user/UserPT'));

const AdminDashboard = lazy(() => import('./pages/dashboard/AdminDashboard'));
const AdminMenu = lazy(() => import('./pages/dashboard/admin/AdminMenu'));
const AdminFoodDiary = lazy(() => import('./pages/dashboard/admin/FoodDiary'));
const AdminPT = lazy(() => import('./pages/dashboard/admin/AdminPT'));
const AdminAnalytics = lazy(() => import('./pages/dashboard/admin/AdminAnalytics'));
const AdminOrders = lazy(() => import('./pages/dashboard/admin/AdminOrders'));
const AdminFinanceRevenue = lazy(() => import('./pages/dashboard/admin/finance/Revenue'));
const AdminFinanceExpenses = lazy(() => import('./pages/dashboard/admin/finance/Expenses'));
const AdminFinancePayouts = lazy(() => import('./pages/dashboard/admin/finance/Payouts'));
const AdminFinanceTransactions = lazy(() => import('./pages/dashboard/admin/finance/Transactions'));

const PTDashboard = lazy(() => import('./pages/dashboard/PTDashboard'));
const PTMenu = lazy(() => import('./pages/dashboard/pt/PTMenu'));
const PTProfile = lazy(() => import('./pages/dashboard/pt/PTProfile'));

const FoodCatalog = lazy(() => import('./pages/customer/FoodCatalog'));
const FoodDetails = lazy(() => import('./pages/customer/FoodDetails'));
const PTDirectory = lazy(() => import('./pages/customer/PTDirectory'));
const PTDetails = lazy(() => import('./pages/customer/PTDetails'));
const Cart = lazy(() => import('./pages/customer/Cart'));
const Checkout = lazy(() => import('./pages/customer/Checkout'));

// ==================== Loading Component ====================
const Loading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="animate-spin text-orange-500" size={40} />
  </div>
);

const DashboardRedirect = () => {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'Admin') return <Navigate to="/dashboard/admin" replace />;
  if (user.role === 'PT') return <Navigate to="/dashboard/pt-view" replace />;
  return <Navigate to="/dashboard/user" replace />;
};

// ==================== Protected Route ====================
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return <Loading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const RouteThemeClassSync = () => {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const roleThemeClasses = ['role-theme-customer', 'role-theme-pt', 'role-theme-admin'];
    document.body.classList.remove(...roleThemeClasses);

    const pathname = location.pathname;
    let nextThemeClass = '';

    if (pathname.startsWith('/dashboard/admin')) {
      nextThemeClass = 'role-theme-admin';
    } else if (pathname.startsWith('/dashboard/pt') || pathname.startsWith('/dashboard/pt-view')) {
      nextThemeClass = 'role-theme-pt';
    } else if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/cart') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/food-catalog') ||
      pathname.startsWith('/food/') ||
      pathname.startsWith('/pt-directory') ||
      pathname.startsWith('/pt/')
    ) {
      nextThemeClass = 'role-theme-customer';
    } else if (pathname === '/' && user?.role === 'Customer') {
      nextThemeClass = 'role-theme-customer';
    }

    if (nextThemeClass) {
      document.body.classList.add(nextThemeClass);
    }

    return () => {
      document.body.classList.remove(...roleThemeClasses);
    };
  }, [location.pathname, user?.role]);

  return null;
};

// ==================== App Routes ====================
function AppRoutes() {
  return (
    <Router>
      <RouteThemeClassSync />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/health-survey" element={<HealthSurvey />} />
          <Route path="/food-catalog" element={<FoodCatalog />} />
          <Route path="/food/:id" element={<FoodDetails />} />
          <Route path="/pt-directory" element={<PTDirectory />} />
          <Route path="/pt/:id" element={<PTDetails />} />

          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* Customer Routes */}
          <Route
            path="/dashboard/user"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <UserDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/menu"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <UserMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/diary"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <UserDiary />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/pt"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <UserPT />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <Checkout />
              </ProtectedRoute>
            }
          />

          {/* PT Routes */}
          <Route
            path="/dashboard/pt-view"
            element={
              <ProtectedRoute allowedRoles={['PT']}>
                <PTDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/pt/menu"
            element={
              <ProtectedRoute allowedRoles={['PT']}>
                <PTMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/pt/profile"
            element={
              <ProtectedRoute allowedRoles={['PT']}>
                <PTProfile />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/analytics"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/menu"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/pt"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminPT />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/orders"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/finance/revenue"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminFinanceRevenue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/finance/expenses"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminFinanceExpenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/finance/payouts"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminFinancePayouts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/finance/transactions"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminFinanceTransactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin/food-diary"
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminFoodDiary />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

// ==================== Main App ====================
export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </AuthProvider>
  );
}