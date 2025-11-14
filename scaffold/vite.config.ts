import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";

export default defineConfig(() => ({
  server: {
    host: process.env.HOST || "::",
    port: Number(process.env.PORT) || 8080,
  },
  plugins: [dyadComponentTagger(), react()],
  resolve: {
    alias: {
      "@": path.resolve("./src"),
    },
  },
}));
