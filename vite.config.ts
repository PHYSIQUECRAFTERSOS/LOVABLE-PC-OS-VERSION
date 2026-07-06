import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    // esbuild minifier: nearly-identical output to terser but ~10x faster
    // builds. Runtime performance is unchanged.
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // Keep the big shared runtime libs in dedicated chunks so a route
          // switch only pays for the diff. Do NOT bucket lucide-react — that
          // forces every icon into a single up-front chunk. Leaving it out
          // lets Vite split it per-page for real tree-shaking.
          if (id.includes("react-router")) return "vendor";
          if (id.match(/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/)) return "vendor";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf";
          if (id.includes("@tanstack")) return "query";
          return "deps";
        },
      },
    },
  },
  esbuild: {
    // Strip console/debugger in production only — matches previous terser
    // behavior without the terser cost.
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));
