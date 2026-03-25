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
    <div className="fixed inset-0 z-50 bg-background flex flex-col animate-slide-in-right" style={{ backgroundColor: 'hsl(0 0% 7%)' }}>
      {/* Safe area top fill */}
      <div className="w-full bg-background" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} />
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 min-h-[56px]">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-center font-display text-lg font-bold text-foreground">
          Messages
        </h1>
        {/* Spacer for centering */}
        <div className="h-8 w-8 shrink-0" />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {isCoach ? (
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="w-full grid grid-cols-2 shrink-0 mx-0 rounded-none">
              <TabsTrigger value="chat">Conversations</TabsTrigger>
              <TabsTrigger value="auto">Automations</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 mt-0 min-h-0">
              <CoachMessaging />
            </TabsContent>
            <TabsContent value="auto" className="flex-1 mt-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <AutoMessagingManager />
            </TabsContent>
          </Tabs>
        ) : (
          <ClientMessaging />
        )}
      </div>
    </div>
  );
};

export default Messages;
