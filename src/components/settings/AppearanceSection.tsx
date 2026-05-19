import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme, Theme } from "@/hooks/useTheme";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const Option = ({
  value,
  active,
  onClick,
  icon: Icon,
  label,
}: {
  value: Theme;
  active: boolean;
  onClick: () => void;
  icon: typeof Sun;
  label: string;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={active}
    onClick={onClick}
    className={cn(
      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const AppearanceSection = () => {
  const { theme, setTheme } = useTheme();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          role="radiogroup"
          aria-label="Theme"
          className="flex items-center gap-1 p-1 rounded-lg bg-muted border border-border"
        >
          <Option
            value="dark"
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
            icon={Moon}
            label="Dark"
          />
          <Option
            value="light"
            active={theme === "light"}
            onClick={() => setTheme("light")}
            icon={Sun}
            label="Light"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Applies instantly across the app and syncs to your account.
        </p>
      </CardContent>
    </Card>
  );
};

export default AppearanceSection;
