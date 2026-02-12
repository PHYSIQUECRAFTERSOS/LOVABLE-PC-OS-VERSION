import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Messages = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground">Messages</h1>
        <Card>
          <CardHeader>
            <CardTitle>Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your messages and group chats will appear here.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Messages;
