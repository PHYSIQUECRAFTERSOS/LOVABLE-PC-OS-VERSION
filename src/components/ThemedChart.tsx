import { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

/**
 * Wrap any Recharts/SVG block whose colors come from `hsl(var(--token))` strings
 * so the chart remounts on theme change. Recharts captures colors at render time
 * and paints them into the SVG; without a remount the chart keeps old-theme colors
 * after a toggle.
 *
 * Usage:
 *   <ThemedChart><ResponsiveContainer>...</ResponsiveContainer></ThemedChart>
 *
 * The wrapper is invisible (no DOM element of its own besides children).
 */
export function ThemedChart({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <div key={theme} className="w-full h-full">{children}</div>;
}

export default ThemedChart;
