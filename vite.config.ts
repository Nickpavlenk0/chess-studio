import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/chess-studio/",
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          board: ["react-chessboard"],
          validation: ["zod"],
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
