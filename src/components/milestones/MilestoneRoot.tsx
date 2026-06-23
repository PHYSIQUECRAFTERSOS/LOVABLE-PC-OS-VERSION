import { useMilestoneWatcher } from "@/hooks/useMilestoneWatcher";
import MilestoneCelebration from "./MilestoneCelebration";

/** Mount once inside AppLayout for clients. Drives the celebration queue. */
export default function MilestoneRoot() {
  const { current, dismissCurrent } = useMilestoneWatcher();
  return <MilestoneCelebration unlock={current} onDismiss={dismissCurrent} />;
}
