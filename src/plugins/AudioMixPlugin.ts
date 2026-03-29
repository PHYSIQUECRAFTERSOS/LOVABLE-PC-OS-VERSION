import { registerPlugin } from "@capacitor/core";

export interface AudioMixPluginInterface {
  enableMixing(): Promise<{ success: boolean }>;
  playRestTimerAlarm(): Promise<{ success: boolean }>;
}

const AudioMixPlugin = registerPlugin<AudioMixPluginInterface>("AudioMixPlugin");

export default AudioMixPlugin;
