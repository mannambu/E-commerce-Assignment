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
const Profile = lazy(() => import('./pages/customer/Profile'));

const UserDashboard = lazy(() => import('./pages/dashboard/UserDashboard'));
const UserMenu = lazy(() => import('./pages/dashboard/user/UserMenu'));
const UserDiary = lazy(() => import('./pages/dashboard/user/UserDiary'));

const AdminDashboard = lazy(() => import('./pages/dashboard/AdminDashboard'));
const AdminMenu = lazy(() => import('./pages/dashboard/admin/AdminMenu'));
const AdminFoodDiary = lazy(() => import('./pages/dashboard/admin/FoodDiary'));
const AdminAnalytics = lazy(() => import('./pages/dashboard/admin/AdminAnalytics'));
const AdminOrders = lazy(() => import('./pages/dashboard/admin/AdminOrders'));
const AdminUsers = lazy(() => import('./pages/dashboard/admin/AdminUsers'));
const AdminSettings = lazy(() => import('./pages/dashboard/admin/AdminSettings'));
const AdminFinanceRevenue = lazy(() => import('./pages/dashboard/admin/finance/Revenue'));
const AdminFinanceExpenses = lazy(() => import('./pages/dashboard/admin/finance/Expenses'));
const AdminFinanceTransactions = lazy(() => import('./pages/dashboard/admin/finance/Transactions'));

const ManagerWorkspace = lazy(() => import('./pages/workspace/ManagerWorkspace'));
const KitchenWorkspace = lazy(() => import('./pages/workspace/KitchenWorkspace'));
const DeliveryWorkspace = lazy(() => import('./pages/workspace/DeliveryWorkspace'));

const FoodCatalog = lazy(() => import('./pages/customer/FoodCatalog'));
const FoodDetails = lazy(() => import('./pages/customer/FoodDetails'));
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
  switch (user.role) {
    case 'Admin':
      return <Navigate to="/dashboard/admin/users" replace />;
    case 'Manager':
      return <Navigate to="/workspace/manager" replace />;
    case 'Kitchen Staff':
      return <Navigate to="/workspace/kitchen" replace />;
    case 'Delivery Staff':
      return <Navigate to="/workspace/delivery" replace />;
    case 'Customer':
    default:
      return <Navigate to="/dashboard/user" replace />;
  }
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
    const roleThemeClasses = ['role-theme-customer', 'role-theme-admin'];
    document.body.classList.remove(...roleThemeClasses);

    const pathname = location.pathname;
    let nextThemeClass = '';

    if (pathname.startsWith('/dashboard/admin') || pathname.startsWith('/workspace')) {
      nextThemeClass = 'role-theme-admin';
    } else if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/cart') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/food-catalog') ||
      pathname.startsWith('/food/')
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
          <Route path="/menu" element={<Navigate to="/food-catalog" replace />} />
          <Route path="/health-survey" element={<HealthSurvey />} />
          <Route path="/food-catalog" element={<FoodCatalog />} />
          <Route path="/food/:id" element={<FoodDetails />} />

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
            path="/dashboard/profile"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={['Customer']}>
                <Profile />
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

          {/* Operational Workspace Routes (5 roles) */}
          <Route
            path="/workspace/manager"
            element={
              <ProtectedRoute allowedRoles={['Manager', 'Admin']}>
                <ManagerWorkspace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspace/kitchen"
            element={
              <ProtectedRoute allowedRoles={['Kitchen Staff', 'Admin']}>
                <KitchenWorkspace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspace/delivery"
            element={
              <ProtectedRoute allowedRoles={['Delivery Staff', 'Admin']}>
                <DeliveryWorkspace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workspace"
            element={
              <ProtectedRoute>
                <DashboardRedirect />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route path="/dashboard/admin/users" element={<ProtectedRoute allowedRoles={['Admin']}><AdminUsers /></ProtectedRoute>} />
          <Route path="/dashboard/admin/settings" element={<ProtectedRoute allowedRoles={['Admin']}><AdminSettings /></ProtectedRoute>} />
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
