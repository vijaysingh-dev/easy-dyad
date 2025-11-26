import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";

export default defineConfig(() => ({
  server: {
    host: process.env.HOST || "::",
    port: Number(process.env.PORT) || 32100,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
}));
