import axios from "axios";

const legacyBaseUrl = typeof process !== 'undefined' ? process.env.REACT_APP_API_URL : undefined;
const apiBaseUrl = import.meta.env.VITE_API_URL || legacyBaseUrl || "https://e-commerce-7jh5.onrender.com";

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

// Response Interceptor: Xử lý tự động Refresh Token khi lỗi 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Nếu lỗi 401 (Unauthorized) và chưa từng retry
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token available");

        // Gọi API refresh token
        const res = await axios.post(
          `${api.defaults.baseURL}/users/refresh-token`,
          {
            refresh_token: refreshToken,
          },
        );

        // API Spec: endpoint auth trả về trực tiếp object (không có result)
        const { access_token, refresh_token: new_refresh_token } = res.data;

        localStorage.setItem("access_token", access_token);
        if (new_refresh_token) {
          localStorage.setItem("refresh_token", new_refresh_token);
        }

        // Đổi token trong header và gọi lại request ban đầu
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Nếu refresh token cũng hết hạn hoặc lỗi -> Xóa token, đẩy về login
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("userRole");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    // Ném lỗi về cho component xử lý (lấy error.response.data.message)
    return Promise.reject(error);
  },
);

export default api;
