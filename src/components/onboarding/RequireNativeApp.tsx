import { ReactNode, useMemo } from "react";
import { Apple, Smartphone, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const APP_STORE_URL = "https://apps.apple.com/ca/app/physique-crafters/id6760598660";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.physiquecrafters.app.twa";

interface Props {
  children: ReactNode;
}

const RequireNativeApp = ({ children }: Props) => {
  const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

  const platform = useMemo<"ios" | "android" | "desktop">(() => {
    if (typeof navigator === "undefined") return "desktop";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "desktop";
  }, []);

  if (isNative) return <>{children}</>;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const StoreButtons = () => {
    const apple = (
      <a
        key="apple"
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4 text-base font-semibold text-foreground transition hover:bg-primary/20"
      >
        <Apple className="h-6 w-6 text-primary" />
        Download on the App Store
      </a>
    );
    const google = (
      <a
        key="google"
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-5 py-4 text-base font-semibold text-foreground transition hover:bg-primary/20"
      >
        <Smartphone className="h-6 w-6 text-primary" />
        Get it on Google Play
      </a>
    );
    const order = platform === "android" ? [google, apple] : [apple, google];
    return <div className="flex flex-col gap-3">{order}</div>;
  };

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xl">
        <div className="text-center mb-6">
          <p className="font-display text-xl sm:text-2xl font-bold tracking-wide">
            PHYSIQUE <span className="text-primary">CRAFTERS</span>
          </p>
          <p className="text-[11px] tracking-[0.25em] text-muted-foreground mt-1">
            THE TRIPLE O METHOD
          </p>
        </div>

        <h1 className="text-2xl font-bold text-foreground text-center mb-2">
          Finish setup in the app
        </h1>
        <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
          To complete your onboarding and sign your coaching agreement, please download the
          Physique Crafters app. The full experience — workouts, nutrition tracking, and
          messaging — lives there.
        </p>

        <StoreButtons />

        {platform === "desktop" && (
          <p className="text-xs text-muted-foreground text-center mt-5">
            On a computer? Open one of these links on your phone to install.
          </p>
        )}

        <div className="mt-8 pt-5 border-t border-border flex justify-center">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequireNativeApp;
