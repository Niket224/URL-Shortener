import axios from "axios";

// In dev, use same-origin requests so Vite's server proxy forwards /api to the backend.
// That avoids CORS and "Network Error" when the browser blocks cross-origin calls.
const baseURL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "") || "";
if (import.meta.env.PROD && !baseURL) {
  throw new Error("VITE_API_URL is required in production");
}

const api = axios.create({
  baseURL,
  timeout: 10000,
});
let token = sessionStorage.getItem("snip-token") || "";
export function setToken(value) {
  token = value;
  if (value) sessionStorage.setItem("snip-token", value);
  else sessionStorage.removeItem("snip-token");
}
api.interceptors.request.use(config => {
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && token) {
    setToken("");
    window.dispatchEvent(new Event("snip-session-expired"));
  }
  return Promise.reject(error);
});

export const shortenUrl = (data) => api.post("/api/urls", data);
export const getUrls = (page = 1) => api.get("/api/urls", { params: { page, limit: 12 } });
export const getStats = (id) => api.get(`/api/urls/${id}/stats`);
export const deleteUrl = (id) => api.delete(`/api/urls/${id}`);
export const updateUrl = (id, data) => api.patch(`/api/urls/${id}`, data);

export default api;
