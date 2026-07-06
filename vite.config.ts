import { defineConfig } from "vitest/config";
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
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "og-image.png"],
      manifest: {
        // Stable install identity so updates/re-installs are recognised
        // as the same app rather than spawning a duplicate entry.
        id: "/",
        name: "Womanie - Women's Health Companion",
        short_name: "Womanie",
        description: "Personalized health tracking that adapts to every stage of your reproductive journey",
        // Surfaces the app under the right sections in install dialogs /
        // app catalogues.
        categories: ["health", "medical", "lifestyle"],
        theme_color: "#E8B4D8",
        background_color: "#FDF8FC",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        // Real PNG icons generated from the brand mark (public/*.png).
        // SVG stays as the scalable "any" icon; the 192/512 PNGs satisfy
        // the Android install prompt + Lighthouse, and the 512 doubles as
        // the maskable icon (full-bleed gradient, heart inside the safe zone).
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        // PWA shortcuts — long-press the home-screen icon (Android)
        // or right-click the desktop install (Chromium) and these
        // surface. Picks the four destinations a mobile user most
        // often opens the app to reach.
        shortcuts: [
          {
            name: "AI Doctor",
            short_name: "Ask",
            description: "Open the AI health assistant",
            url: "/dashboard/ai-doctor",
          },
          {
            name: "Medical records",
            short_name: "Records",
            description: "Open your uploaded medical documents",
            url: "/dashboard/medical-history",
          },
          {
            name: "Appointments",
            short_name: "Visits",
            description: "Manage upcoming and past appointments",
            url: "/dashboard/appointments",
          },
          {
            name: "Settings",
            short_name: "Settings",
            description: "Mode, profile, and personal info",
            url: "/dashboard/settings",
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
      output: {
        // Split the stable, rarely-changing vendor libraries into their
        // own long-cached chunks. Two wins for the phone app on cellular:
        // (1) the main entry shrinks (it was ~500 KB), so first paint is
        // faster; (2) shipping an app-code change no longer busts the
        // React/Radix/chart bundles, so returning users re-download only
        // what actually changed. Grouped by family to avoid a waterfall
        // of dozens of tiny requests.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) {
            return "charts";
          }
          if (
            id.includes("/react-dom/") ||
            id.includes("/react-router") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          if (id.includes("@radix-ui") || id.includes("cmdk") || id.includes("vaul")) {
            return "ui-vendor";
          }
        },
      },
    },
  },
  test: {
    // Pure-logic tests (cycle math, lab interpretation, api utils) run in
    // the fast node environment by default. Component tests — file suffix
    // .test.tsx under src/ — opt into jsdom via environmentMatchGlobs so
    // they get a DOM without slowing down the node suite.
    environment: "node",
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // The api/ layer is pure-Node serverless handlers; its dependency-free
      // utils (lab title/unit normalisation, etc.) are worth unit-testing too.
      "api/**/*.{test,spec}.{ts,tsx}",
    ],
  },
}));
