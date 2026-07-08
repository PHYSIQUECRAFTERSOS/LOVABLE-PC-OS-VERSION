import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { transformSupabaseImage } from "@/lib/supabaseImage";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

// Auto-rewrite Supabase Storage URLs to a 96×96 WebP thumbnail so raw
// <AvatarImage src=…/> call sites across the app benefit from the same
// payload reduction UserAvatar gets. Non-Supabase URLs pass through
// untouched. Already-transformed URLs (rendered path) also pass through.
// This is the single biggest scroll-perf win once list surfaces render
// dozens of avatars — a 500 KB portrait becomes ~8 KB.
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, loading, decoding, ...props }, ref) => {
  const resolved =
    typeof src === "string"
      ? transformSupabaseImage(src, {
          width: 96,
          height: 96,
          quality: 70,
          resize: "cover",
        })
      : src;
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn("aspect-square h-full w-full object-cover", className)}
      src={resolved}
      loading={loading ?? "lazy"}
      decoding={decoding ?? "async"}
      {...props}
    />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
