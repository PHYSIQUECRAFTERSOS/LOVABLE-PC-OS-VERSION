import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Stable per build. Exposed as `__BUILD_ID__` in app code and written to
// dist/version.json so the running app can detect a new deploy by polling.
const BUILD_ID =
  process.env.VITE_BUILD_ID ||
  process.env.COMMIT_REF ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  String(Date.now());

// Emit /version.json at build time so the client can poll it with no-store.
function versionJsonPlugin(): Plugin {
  return {
    name: "pc-version-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID, builtAt: Date.now() }),
      });
    },
    closeBundle() {
      // Belt-and-suspenders for hosts that skip emitFile assets.
      try {
        const outDir = path.resolve(__dirname, "dist");
        if (fs.existsSync(outDir)) {
          fs.writeFileSync(
            path.join(outDir, "version.json"),
            JSON.stringify({ buildId: BUILD_ID, builtAt: Date.now() }),
          );
        }
      } catch {
        // best-effort
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), versionJsonPlugin()].filter(Boolean),
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
          // Heavy libraries that must code-split into their own async chunks
          // (loaded on demand at the feature call site). Do NOT bucket these
          // into any shared chunk or they end up in the eager initial bundle.
          if (id.includes("@zxing")) return undefined;
          if (id.includes("emoji-picker-react")) return undefined;
          if (id.includes("pdfjs-dist")) return undefined;
          if (id.includes("@ffmpeg")) return undefined;
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
