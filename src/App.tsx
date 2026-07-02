import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { RankedXPProvider } from "@/hooks/useXPAward";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { PushNotificationsInit } from "./components/PushNotificationsInit";
import HealthSyncBootstrap from "./components/HealthSyncBootstrap";
import SplashGate from "./components/SplashScreen/SplashGate";
import { ThemeProvider } from "./hooks/useTheme";

// Lazy-loaded routes — desktop web downloads only the current page's chunk.
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Setup = lazy(() => import("./pages/Setup"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const RequireNativeApp = lazy(() => import("./components/onboarding/RequireNativeApp"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminRepairSavedMeals = lazy(() => import("./pages/AdminRepairSavedMeals"));
const Training = lazy(() => import("./pages/Training"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Messages = lazy(() => import("./pages/Messages"));
const Progress = lazy(() => import("./pages/Progress"));
const Profile = lazy(() => import("./pages/Profile"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Community = lazy(() => import("./pages/Community"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Ranked = lazy(() => import("./pages/Ranked"));
const Team = lazy(() => import("./pages/Team"));
const Clients = lazy(() => import("./pages/Clients"));
const MasterLibraries = lazy(() => import("./pages/MasterLibraries"));
const ClientDetail = lazy(() => import("./pages/ClientDetail"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
const Support = lazy(() => import("./pages/Support"));
const BodyStats = lazy(() => import("./pages/BodyStats"));
const Subscribe = lazy(() => import("./pages/Subscribe"));
const Info = lazy(() => import("./pages/Info"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const ClientTracker = lazy(() => import("./pages/ClientTracker"));
const SyncLogDebug = lazy(() => import("./pages/SyncLogDebug"));

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

const RouteFallback = () => null;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
        <SubscriptionProvider>
        <RankedXPProvider>
        <Toaster />
        <Sonner />
        <SplashGate />
        <PWAInstallPrompt />
        <PushNotificationsInit />
        <HealthSyncBootstrap />
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/delete-account" element={<DeleteAccount />} />
            <Route path="/support" element={<Support />} />
            <Route path="/info" element={<Info />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/onboarding" element={<ProtectedRoute><RequireNativeApp><Onboarding /></RequireNativeApp></ProtectedRoute>} />
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
            <Route path="/ranked" element={<ProtectedRoute><Ranked /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><Team /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><Clients /></ProtectedRoute>} />
            <Route path="/clients/:clientId" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><ClientDetail /></ProtectedRoute>} />
            <Route path="/libraries" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><MasterLibraries /></ProtectedRoute>} />
            <Route path="/client-tracker" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><ClientTracker /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><Admin /></ProtectedRoute>} />
            <Route path="/admin/repair-saved-meals" element={<ProtectedRoute allowedRoles={["admin"]}><AdminRepairSavedMeals /></ProtectedRoute>} />
            <Route path="/body-stats" element={<ProtectedRoute><BodyStats /></ProtectedRoute>} />
            <Route path="/subscribe" element={<ProtectedRoute><Subscribe /></ProtectedRoute>} />
            <Route path="/debug/sync-log" element={<ProtectedRoute><SyncLogDebug /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </RankedXPProvider>
        </SubscriptionProvider>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
