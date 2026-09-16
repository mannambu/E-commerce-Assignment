import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import api from '@/services/api';

interface User {
  _id: string;
  email: string;
  username: string;
  role: 'Customer' | 'PT' | 'Admin';
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
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

    const fetchProfile = async () => {
    try {
      const response = await api.get('/users/me');

      const userData = response.data.result || response.data.user || response.data;
      setUser(userData);

    } catch (error: any) {
        console.error('Không thể tải hồ sơ người dùng:', error.response?.data || error.message);
      logout(); 
    } finally {
      setLoading(false);
    }
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

  const login = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    await fetchProfile();
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};