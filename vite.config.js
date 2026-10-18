import { defineConfig } from "vite";

// base "./" lets the build run from GitHub Pages project paths or any subfolder.
export default defineConfig({
  base: "./",
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
