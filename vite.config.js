import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const base = process.env.NODE_ENV === "production" && process.env.VERCEL !== "1"
  ? "/admin/"
  : "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: {
    host: "localhost",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
    },
  },
});
