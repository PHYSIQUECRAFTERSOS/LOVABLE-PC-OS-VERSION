import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { Suspense, lazy } from "react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import DeleteAccount from "./pages/DeleteAccount";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

// Lazy-load all protected pages to prevent recharts from blocking initial load
const Setup = lazy(() => import("./pages/Setup"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const Training = lazy(() => import("./pages/Training"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Messages = lazy(() => import("./pages/Messages"));
const Progress = lazy(() => import("./pages/Progress"));
const Profile = lazy(() => import("./pages/Profile"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Community = lazy(() => import("./pages/Community"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Team = lazy(() => import("./pages/Team"));
const Clients = lazy(() => import("./pages/Clients"));
const MasterLibraries = lazy(() => import("./pages/MasterLibraries"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      queryFn: undefined,
    },
    mutations: {
      retry: 0,
    },
  },
});

const PageFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/delete-account" element={<DeleteAccount />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
              <Route path="/nutrition" element={<ProtectedRoute><Nutrition /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
              <Route path="/community" element={<ProtectedRoute><Community /></ProtectedRoute>} />
              <Route path="/challenges" element={<ProtectedRoute><Challenges /></ProtectedRoute>} />
              <Route path="/team" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><Team /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><Clients /></ProtectedRoute>} />
              <Route path="/clients/:clientId" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><ClientDetail /></ProtectedRoute>} />
              <Route path="/libraries" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><MasterLibraries /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><Admin /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
