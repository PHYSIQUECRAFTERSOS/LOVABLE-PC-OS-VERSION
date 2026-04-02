import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import AppLayout from "@/components/AppLayout";
import CoachMessaging from "@/components/messaging/CoachMessaging";
import ClientMessaging from "@/components/messaging/ClientMessaging";

const Messages = () => {
  const { role } = useAuth();
  const isMobile = useIsMobile();
  const isCoach = role === "coach" || role === "admin";

  const content = isCoach ? <CoachMessaging /> : <ClientMessaging />;

  // Mobile: full-screen overlay (native feel)
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col animate-slide-in-right"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        <div
          className="w-full shrink-0"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            backgroundColor: "hsl(var(--background))",
          }}
        />
        <div className="flex-1 min-h-0 flex flex-col">
          {content}
        </div>
      </div>
    );
  }

  // Desktop: inside AppLayout with sidebar visible
  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] -m-4 md:-m-8 flex flex-col">
        {content}
      </div>
    </AppLayout>
  );
};

export default Messages;
