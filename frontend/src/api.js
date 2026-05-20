import axios from "axios";

// In dev, use same-origin requests so Vite's server proxy forwards /api to the backend.
// That avoids CORS and "Network Error" when the browser blocks cross-origin calls.
const baseURL =
  import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ""
    ? import.meta.env.VITE_API_URL
    : import.meta.env.DEV
      ? ""
      : "http://localhost:5001";

const api = axios.create({
  baseURL,
  timeout: 10000,
});

export const shortenUrl = (data) => api.post("/api/urls", data);
export const getUrls = () => api.get("/api/urls");
export const getStats = (id) => api.get(`/api/urls/${id}/stats`);
export const deleteUrl = (id) => api.delete(`/api/urls/${id}`);

export default api;
