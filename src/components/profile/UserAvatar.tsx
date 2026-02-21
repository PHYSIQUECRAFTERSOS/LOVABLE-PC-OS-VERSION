import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  fallbackClassName?: string;
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
  return (
    <Avatar className={cn("ring-2 ring-primary/30", className)}>
      {src && <AvatarImage src={src} alt={name || "User"} className="object-cover" loading="lazy" />}
      <AvatarFallback className={cn("bg-secondary text-primary font-semibold", fallbackClassName)}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
};

export default UserAvatar;
