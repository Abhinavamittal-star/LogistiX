import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const instance = axios.create({ baseURL: BASE_URL, timeout: 15000 });

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('lx_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

instance.interceptors.response.use(
  response => response.data,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried && localStorage.getItem('lx_refresh')) {
      original._retried = true;
      try {
        const response = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: localStorage.getItem('lx_refresh') });
        localStorage.setItem('lx_token', response.data.accessToken);
        localStorage.setItem('lx_refresh', response.data.refreshToken);
        original.headers.Authorization = `Bearer ${response.data.accessToken}`;
        return instance(original);
      } catch {
        localStorage.removeItem('lx_token');
        localStorage.removeItem('lx_refresh');
        localStorage.removeItem('lx_user');
      }
    }
    const message = error?.response?.data?.error || error.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);

export default instance;
