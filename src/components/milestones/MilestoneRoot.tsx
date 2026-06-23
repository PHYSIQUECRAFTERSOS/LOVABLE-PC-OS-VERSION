import { useMilestoneWatcher } from "@/hooks/useMilestoneWatcher";
import MilestoneCelebrationV2 from "./MilestoneCelebrationV2";

/** Mount once inside AppLayout for clients. Drives the celebration queue. */
export default function MilestoneRoot() {
  const { current, dismissCurrent } = useMilestoneWatcher();
  return <MilestoneCelebrationV2 unlock={current} onDismiss={dismissCurrent} />;
}
