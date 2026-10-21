import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? "http://localhost:4000" : "");

if (!apiBaseUrl) {
  throw new Error("Set VITE_API_URL to your backend URL before building the frontend.");
}

const api = axios.create({
  baseURL: apiBaseUrl,
});

// Request Interceptor: Gắn Access Token vào header
api.interceptors.request.use(
  (config) => {
    // Với FormData, để browser tự gắn multipart boundary để backend nhận được req.file.
    if (
      typeof FormData !== "undefined" &&
      config.data instanceof FormData &&
      config.headers
    ) {
      delete config.headers["Content-Type"];
    }

    const rawToken = localStorage.getItem("access_token");
    const token = rawToken?.replace(/^"|"$/g, "").trim();

    // Chỉ gắn header khi token có format JWT hợp lệ để tránh backend trả 422 do token parse lỗi.
    if (token && token.split(".").length === 3) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (rawToken) {
      localStorage.removeItem("access_token");
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

let refreshInFlight: Promise<string> | null = null;
const endSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('userRole');
  window.location.assign('/login');
};

// Share token rotation when several admin panels load concurrently.
export const waitForSessionRefresh = async () => {
  if (refreshInFlight) await refreshInFlight;
};

// Response Interceptor: Xử lý tự động Refresh Token khi lỗi 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const authEndpoint = /\/users\/(login|register|logout|logout-all|forgot-password|reset-password|refresh-token)(?:\?|$)/.test(originalRequest?.url || '');
    if (error.response?.status === 401 && originalRequest && !authEndpoint) {
      if (originalRequest._retry || !localStorage.getItem('refresh_token')) {
        endSession();
        return Promise.reject(error);
      }
      originalRequest._retry = true;
      try {
        if (!refreshInFlight) {
          refreshInFlight = axios.post(`${api.defaults.baseURL}/users/refresh-token`, {
            refresh_token: localStorage.getItem('refresh_token')
          }).then(res => {
            const { access_token, refresh_token } = res.data;
            localStorage.setItem('access_token', access_token);
            if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
            return access_token as string;
          }).finally(() => { refreshInFlight = null; });
        }
        const access_token = await refreshInFlight;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // A network/server error is retryable; a revoked session is not.
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) endSession();
        return Promise.reject(refreshError);
      }
    }

    // Ném lỗi về cho component xử lý (lấy error.response.data.message)
    return Promise.reject(error);
  },
);

export default api;
