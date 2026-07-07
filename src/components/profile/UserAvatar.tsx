import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  /**
   * Rendering context retained for call-site compatibility. Avatar display uses
   * the stored raw image so portrait profile photos render like they did before
   * the image-transform regression.
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

const UserAvatar = ({ src, name, className, fallbackClassName }: UserAvatarProps) => {
  const [failed, setFailed] = useState(false);
  const imageSrc = !failed ? src || undefined : undefined;
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
