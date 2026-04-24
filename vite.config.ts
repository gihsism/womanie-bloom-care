import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Womanie - Women's Health Companion",
        short_name: "Womanie",
        description: "Personalized health tracking that adapts to every stage of your reproductive journey",
        theme_color: "#E8B4D8",
        background_color: "#FDF8FC",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        // Only the SVG favicon ships — the old pwa-*.png / apple-
        // touch-icon.png files were Lovable-scaffolding JPEGs
        // mislabelled as PNGs. Chrome 93+ / Firefox / Edge accept
        // SVG icons in manifests with "any maskable".
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      external: ['@niceplugins/capacitor-healthkit'],
    },
  },
}));
