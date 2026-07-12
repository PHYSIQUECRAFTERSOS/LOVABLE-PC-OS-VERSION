/// <reference types="vite/client" />

declare module "@fontsource-variable/geist";
declare module "@fontsource-variable/geist-mono";

// Injected by vite.config.ts at build time. Stable per deploy; used by the
// version-poll heartbeat to detect that a new build is live.
declare const __BUILD_ID__: string;
