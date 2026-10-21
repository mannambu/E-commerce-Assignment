import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import api from '@/services/api';

export type UserRole = 'Customer' | 'Manager' | 'Kitchen Staff' | 'Delivery Staff' | 'Admin';

export const ALL_ROLES: UserRole[] = [
  'Customer',
  'Manager',
  'Kitchen Staff',
  'Delivery Staff',
  'Admin',
];

export interface UserAddress {
  _id?: string;
  id?: string;
  name: string;
  phone: string;
  address: string;
  label?: string;
  fullAddress?: string;
  isDefault: boolean;
}

export interface UserHealthProfile {
  gender: 'Male' | 'Female';
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: 'Sedentary' | 'Light' | 'Moderate' | 'Active' | 'Very Active';
  goal: 'LoseFat' | 'GainMuscle' | 'MaintainWeight';
  allergies: string[];
  dietaryRestrictions?: string[];
  targetWeightKg?: number;
  bmr?: number;
  tdee?: number;
  targetCalories?: number;
  targetAdjustedToBmr?: boolean;
  macroDistribution?: {
    protein: number;
    carb: number;
    fat: number;
  };
  version?: number;
  calculatedAt?: string | Date;
}

export interface User {
  _id: string;
  email: string;
  username: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  date_of_birth?: string;
  account_status?: 'Active' | 'Locked';
  addresses?: UserAddress[];
  healthProfile?: UserHealthProfile;
  created_at?: string;
  updated_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string, initialUserData?: Partial<User>) => Promise<User | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateUser: (updatedData: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getValidStoredToken = () => {
  const rawToken = localStorage.getItem('access_token');
  const token = rawToken?.replace(/^"|"$/g, '').trim();

  if (!token || token.split('.').length !== 3) {
    if (rawToken) localStorage.removeItem('access_token');
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload?.exp && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('userRole');
      return null;
    }
  } catch {
    localStorage.removeItem('access_token');
    return null;
  }

  return token;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchProfile = async (): Promise<User | null> => {
    try {
      const response = await api.get('/users/me');
      const userData = (response.data.result || response.data.user || response.data) as User;

      if (!userData || !ALL_ROLES.includes(userData.role)) {
        await logoutLocal();
        return null;
      }

      setUser(userData);
      localStorage.setItem('userRole', userData.role);
      return userData;
    } catch (error: any) {
      console.error('Không thể tải hồ sơ người dùng:', error.response?.data || error.message);
      await logoutLocal();
      return null;
    } finally {
      setLoading(false);
    }
  };

  const logoutLocal = async () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userRole');
    setUser(null);
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const token = getValidStoredToken();
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncProfile = () => {
      if (getValidStoredToken()) {
        fetchProfile();
      }
    };

    window.addEventListener('fitbite-profile-updated', syncProfile);
    return () => window.removeEventListener('fitbite-profile-updated', syncProfile);
  }, []);

  const login = async (
    accessToken: string,
    refreshToken: string,
    initialUserData?: Partial<User>
  ): Promise<User | null> => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    if (initialUserData?.role) {
      localStorage.setItem('userRole', initialUserData.role);
    }
    const profile = await fetchProfile();
    return profile;
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token')?.replace(/^"|"$/g, '').trim();
      if (refreshToken) {
        await api.post('/users/logout', { refresh_token: refreshToken }).catch(() => {});
      }
    } finally {
      await logoutLocal();
    }
  };

  const logoutAll = async () => {
    try {
      await api.post('/users/logout-all').catch(() => {});
    } finally {
      await logoutLocal();
    }
  };

  const refreshUser = async () => {
    return fetchProfile();
  };

  const updateUser = (updatedData: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updatedData } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        logoutAll,
        refreshUser,
        updateUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
