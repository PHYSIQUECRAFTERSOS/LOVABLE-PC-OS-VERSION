import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Training from "./pages/Training";
import Nutrition from "./pages/Nutrition";
import Analytics from "./pages/Analytics";
import Messages from "./pages/Messages";
import Progress from "./pages/Progress";
import Profile from "./pages/Profile";
import Calendar from "./pages/Calendar";
import Community from "./pages/Community";
import Challenges from "./pages/Challenges";
import Team from "./pages/Team";
import Clients from "./pages/Clients";
import MasterLibraries from "./pages/MasterLibraries";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/setup" element={<Setup />} />
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
          <Route path="/libraries" element={<ProtectedRoute allowedRoles={["coach", "admin"]}><MasterLibraries /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><Admin /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
