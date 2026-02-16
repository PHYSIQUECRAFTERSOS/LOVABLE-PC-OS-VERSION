import AppLayout from "@/components/AppLayout";
import ClientCards from "@/components/dashboard/ClientCards";

const Clients = () => {
  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your client roster, compliance, and progress.
          </p>
        </div>
        <ClientCards />
      </div>
    </AppLayout>
  );
};

export default Clients;
