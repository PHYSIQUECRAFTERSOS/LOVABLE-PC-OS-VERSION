import { createRoot } from "react-dom/client";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App.tsx";
import "./index.css";

// Guard: show visible error if Supabase env vars are missing
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const root = document.getElementById("root")!;

if (!supabaseUrl || !supabaseKey) {
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e5e0d5;font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center">
      <div>
        <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Configuration Error</h1>
        <p style="font-size:14px;color:#888;margin-bottom:16px">Backend environment variables are not available. Please try refreshing.</p>
        <button onclick="window.location.reload()" style="padding:10px 24px;background:#D4A017;color:#0a0a0a;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:14px">Reload</button>
      </div>
    </div>
  `;
} else {
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
