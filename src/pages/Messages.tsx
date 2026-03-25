import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CoachMessaging from "@/components/messaging/CoachMessaging";
import ClientMessaging from "@/components/messaging/ClientMessaging";
import AutoMessagingManager from "@/components/messaging/AutoMessagingManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const Messages = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isCoach = role === "coach" || role === "admin";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col animate-slide-in-right"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      {/* Safe area top — matches background, no white leak */}
      <div
        className="w-full shrink-0"
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          backgroundColor: "hsl(var(--background))",
        }}
      />

      {/* Content fills remaining viewport */}
      <div className="flex-1 min-h-0 flex flex-col">
        {isCoach ? (
          <CoachMessaging />
        ) : (
          <ClientMessaging />
        )}
      </div>
    </div>
  );
};

export default Messages;
