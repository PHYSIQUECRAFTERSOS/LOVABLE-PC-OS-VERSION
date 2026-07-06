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
   * Rendering context. "list" (default) requests a tiny 64px transform for
   * list rows / message threads / command-center cards. "detail" requests
   * 256px for large profile / detail views. The stored original is untouched.
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

const UserAvatar = ({ src, name, className, fallbackClassName, size = "list" }: UserAvatarProps) => {
  const [failed, setFailed] = useState(false);
  const width = size === "detail" ? 256 : 64;
  const transformed = !failed ? transformSupabaseImage(src, { width, quality: 70, resize: "cover" }) : undefined;
  return (
    <Avatar className={cn("ring-2 ring-primary/30", className)}>
      {transformed && (
        <AvatarImage
          src={transformed}
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
