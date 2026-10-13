import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build") {
    try {
      const url = new URL(env.VITE_API_URL?.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.pathname !== "/" || url.search || url.hash) throw new Error();
    } catch {
      throw new Error("VITE_API_URL is required for builds and must be an HTTP(S) origin without a path or credentials");
    }
  }
  return {
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
  };
});
