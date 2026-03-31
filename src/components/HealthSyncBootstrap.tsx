import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";

const HealthSyncBootstrap = () => {
  const { user, role } = useAuth();

  useHealthSync({
    enableAutoSync: !!user && role === "client",
  });

  return null;
};

export default HealthSyncBootstrap;