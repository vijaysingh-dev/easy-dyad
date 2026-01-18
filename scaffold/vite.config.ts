import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";

export default defineConfig(() => ({
  // server: {
  //   host: process.env.HOST || "::",
  //   port: Number(process.env.PORT) || 3000,
  //   strictPort: true,
  //   hmr: {
  //     protocol: "wss",
  //     host: "api.dev.eezi.ai",
  //     port: 443,
  //   },
  // },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
}));
