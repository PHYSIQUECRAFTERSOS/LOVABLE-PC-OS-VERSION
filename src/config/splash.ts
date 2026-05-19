/**
 * Splash screen configuration.
 * Tune the launch experience from here — no other file edits required.
 */

export type SplashStyle = "fade_scale" | "shimmer" | "draw_in" | "layered";
export type SplashScope = "native" | "web" | "native+web";
export type SplashTrigger = "every_open" | "cold_start" | "cold_start_per_session";

export interface SplashConfig {
  SPLASH_STYLE: SplashStyle;
  SPLASH_DURATION_MS: number;
  SPLASH_FADE_OUT_MS: number;
  SPLASH_SCOPE: SplashScope;
  SPLASH_TRIGGER: SplashTrigger;
  SPLASH_BG: string;
  SPLASH_ACCENT: string;
  SPLASH_REDUCED_MOTION: boolean;
}

export const SPLASH: SplashConfig = {
  SPLASH_STYLE: "fade_scale",
  SPLASH_DURATION_MS: 1200,
  SPLASH_FADE_OUT_MS: 350,
  SPLASH_SCOPE: "native",
  SPLASH_TRIGGER: "cold_start",
  SPLASH_BG: "#0a0a0a",
  SPLASH_ACCENT: "#D4A017",
  SPLASH_REDUCED_MOTION: true,
};
