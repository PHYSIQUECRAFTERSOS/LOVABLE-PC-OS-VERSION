import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { prefetchRoute } from "@/lib/routePrefetch";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, onMouseEnter, onFocus, onTouchStart, ...props }, ref) => {
    // Prefetch the destination route chunk on hover / focus / tap-start.
    // This is the single biggest perceived-speed win on desktop: by the time
    // the click fires, the JS is already in memory.
    const targetPath = typeof to === "string" ? to : (to as { pathname?: string })?.pathname || "";

    const handlePrefetch = useCallback(() => {
      if (targetPath) prefetchRoute(targetPath);
    }, [targetPath]);

    const wrap = <T,>(orig: ((e: T) => void) | undefined) =>
      (e: T) => {
        handlePrefetch();
        orig?.(e);
      };

    return (
      <RouterNavLink
        ref={ref}
        to={to}
        onMouseEnter={wrap(onMouseEnter)}
        onFocus={wrap(onFocus)}
        onTouchStart={wrap(onTouchStart)}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
