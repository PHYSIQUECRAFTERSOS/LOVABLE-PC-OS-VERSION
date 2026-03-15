import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SelectableClientCards, {
  type SelectableClient,
} from "@/components/clients/SelectableClientCards";
import BulkMessageComposer from "@/components/clients/BulkMessageComposer";
import AddClientDialog from "@/components/clients/AddClientDialog";
import InviteList from "@/components/clients/InviteList";
import InviteDashboard from "@/components/clients/InviteDashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DeactivatedClientsList from "@/components/clients/DeactivatedClientsList";
import { Plus, Users, Send, BarChart3, UserX } from "lucide-react";

const Clients = () => {
  const [addOpen, setAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deactivatedRefreshKey, setDeactivatedRefreshKey] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<SelectableClient[]>([]);

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Clients
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your client roster, invites, and progress.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Active Clients
            </TabsTrigger>
            <TabsTrigger value="invites" className="gap-2">
              <Send className="h-3.5 w-3.5" />
              Invites
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              Invite Dashboard
            </TabsTrigger>
            <TabsTrigger value="deactivated" className="gap-2">
              <UserX className="h-3.5 w-3.5" />
              Deactivated
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <SelectableClientCards
              onSelectionChange={setSelectedClients}
              onSendMessage={() => setBulkOpen(true)}
              onClientStatusChanged={() => setDeactivatedRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="invites" className="mt-4">
            <InviteList refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="dashboard" className="mt-4">
            <InviteDashboard />
          </TabsContent>

          <TabsContent value="deactivated" className="mt-4">
            <DeactivatedClientsList refreshKey={deactivatedRefreshKey} />
          </TabsContent>
        </Tabs>

        <AddClientDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onInviteSent={() => setRefreshKey((k) => k + 1)}
        />

        <BulkMessageComposer
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          recipients={selectedClients}
        />
      </div>
    </AppLayout>
  );
};

export default Clients;
