import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CoachMessaging from "@/components/messaging/CoachMessaging";
import ClientMessaging from "@/components/messaging/ClientMessaging";
import AutoMessagingManager from "@/components/messaging/AutoMessagingManager";

const Messages = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  return (
    <AppLayout>
      <div className="animate-fade-in h-[calc(100vh-6rem)] md:h-[calc(100vh-4rem)]">
        {isCoach ? (
          <Tabs defaultValue="chat" className="h-full flex flex-col">
            <TabsList className="w-full grid grid-cols-2 shrink-0">
              <TabsTrigger value="chat">Conversations</TabsTrigger>
              <TabsTrigger value="auto">Automations</TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 mt-2 min-h-0">
              <CoachMessaging />
            </TabsContent>
            <TabsContent value="auto" className="flex-1 mt-2 overflow-y-auto">
              <AutoMessagingManager />
            </TabsContent>
          </Tabs>
        ) : (
          <ClientMessaging />
        )}
      </div>
    </AppLayout>
  );
};

export default Messages;
