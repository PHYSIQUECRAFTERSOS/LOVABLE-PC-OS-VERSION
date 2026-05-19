import { registerPlugin } from "@capacitor/core";

export interface AudioMixPluginInterface {
  /** Configures AVAudioSession to .playback + .mixWithOthers so audio
   *  layers over Spotify/Apple Music without ducking or interrupting. */
  enableMixing(): Promise<{ success: boolean }>;
  /** Loads & prepares the bundled rest-timer-complete.mp3 into a retained
   *  AVAudioPlayer so the first play has zero decode latency. */
  preloadRestTimerCue(): Promise<{ success: boolean }>;
  /** Plays the bundled rest-timer-complete.mp3 with .mixWithOthers active. */
  playRestTimerCue(): Promise<{ success: boolean }>;
}

const AudioMixPlugin = registerPlugin<AudioMixPluginInterface>("AudioMixPlugin");

export default AudioMixPlugin;
