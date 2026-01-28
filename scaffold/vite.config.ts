import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";

export default defineConfig(() => ({
  server: {
    allowedHosts: [".easy-dyad.ai", "localhost", "127.0.0.1"],

    strictPort: true,
    host: process.env.HOST || "0.0.0.0",
    port: Number(process.env.PORT) || 3000,
    hmr: {
      protocol: process.env.HMR_PROTOCOL || "ws",
      host: process.env.HMR_HOST || "localhost",
      port: Number(process.env.PORT) || 3000,
      clientPort: Number(process.env.HMR_PORT) || 3000,
    },
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
}));
