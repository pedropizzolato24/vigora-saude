import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  define: {
    // Necessário para módulos que usam __DEV__ (React Native / Expo)
    __DEV__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
