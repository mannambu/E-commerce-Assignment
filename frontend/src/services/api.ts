import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? 'http://localhost:4000' : '');

if (!apiBaseUrl) {
  throw new Error('Set VITE_API_URL to your backend URL before building the frontend.');
}

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Danh sách các endpoint không được tự động trigger refresh token khi nhận 401
const AUTH_EXCLUDED_ENDPOINTS = [
  '/users/login',
  '/users/register',
  '/users/logout',
  '/users/logout-all',
  '/users/forgot-password',
  '/users/reset-password',
  '/users/refresh-token',
];

const isExcludedEndpoint = (url?: string): boolean => {
  if (!url) return false;
  return AUTH_EXCLUDED_ENDPOINTS.some((endpoint) => url.includes(endpoint));
};

// Request Interceptor: Gắn Access Token vào header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Với FormData, để browser tự sinh multipart boundary
    if (
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData &&
      config.headers
    ) {
      delete config.headers['Content-Type'];
    }

    const rawToken = localStorage.getItem('access_token');
    const token = rawToken?.replace(/^"|"$/g, '').trim();

    // Chỉ gắn header khi token có format JWT hợp lệ (3 phần ngăn cách bởi dấu chấm)
    if (token && token.split('.').length === 3) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (rawToken) {
      localStorage.removeItem('access_token');
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Single-flight refresh token state
let refreshPromise: Promise<string | null> | null = null;

// Let logout handlers wait for token rotation before revoking the session.
export const waitForSessionRefresh = async (): Promise<void> => {
  if (refreshPromise) await refreshPromise;
};

const clearAuthAndRedirect = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('userRole');
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
};

// Response Interceptor: Xử lý Single-Flight Refresh Token khi lỗi 401
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // Không xử lý nếu không có request config hoặc thuộc các endpoint loại trừ
    if (!originalRequest || isExcludedEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // Nếu lỗi 403 Forbidden: không gọi refresh token, trả lỗi về UI
    if (error.response?.status === 403) {
      return Promise.reject(error);
    }

    // Nếu lỗi 401 (Unauthorized) và chưa retry
    if (error.response?.status === 401) {
      if (originalRequest._retry) {
        // Đã retry 1 lần mà vẫn 401 -> Token không còn hợp lệ, xóa phiên và về login
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token')?.replace(/^"|"$/g, '').trim();
      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      // Single-flight: Nếu đã có refreshPromise đang chạy, dùng chung Promise đó
      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const res = await axios.post(`${apiBaseUrl}/users/refresh-token`, {
              refresh_token: refreshToken,
            });

            // Endpoint /users/refresh-token trả trực tiếp ở root: { access_token, refresh_token }
            const { access_token, refresh_token: new_refresh_token } = res.data || {};

            if (!access_token) {
              throw new Error('Không nhận được access_token mới');
            }

            localStorage.setItem('access_token', access_token);
            if (new_refresh_token) {
              localStorage.setItem('refresh_token', new_refresh_token);
            }

            return access_token;
          } catch (refreshErr) {
            clearAuthAndRedirect();
            return null;
          } finally {
            refreshPromise = null;
          }
        })();
      }

      const newAccessToken = await refreshPromise;
      if (!newAccessToken) {
        return Promise.reject(error);
      }

      // Thử lại request ban đầu với Access Token mới
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export default api;
