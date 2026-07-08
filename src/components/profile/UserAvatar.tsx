import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { transformSupabaseImage } from "@/lib/supabaseImage";

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  /**
   * "list" (default) requests a small square thumbnail through Supabase's
   * image transform (both width AND height set so aspect is preserved and
   * the browser's object-cover centers the crop). "detail" uses the raw
   * stored original for high-fidelity profile views.
   */
  size?: "list" | "detail";
}

const getInitials = (name?: string) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const UserAvatar = ({
  src,
  name,
  className,
  fallbackClassName,
  size = "list",
}: UserAvatarProps) => {
  const [failed, setFailed] = useState(false);

  // For list contexts, request a 96×96 WebP via Supabase's image transform.
  // Passing BOTH width and height with resize=cover was the missing piece —
  // width-only requests previously produced tall crops that looked "zoomed
  // in" through object-cover. Non-Supabase URLs pass through untouched.
  const resolved =
    size === "detail"
      ? src || undefined
      : transformSupabaseImage(src || undefined, {
          width: 96,
          height: 96,
          quality: 70,
          resize: "cover",
        });

  const imageSrc = !failed ? resolved : undefined;
  return (
    <Avatar className={cn("ring-2 ring-primary/30", className)}>
      {imageSrc && (
        <AvatarImage
          src={imageSrc}
          alt={name || "User"}
          className="object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <AvatarFallback className={cn("bg-secondary text-primary font-semibold", fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;
