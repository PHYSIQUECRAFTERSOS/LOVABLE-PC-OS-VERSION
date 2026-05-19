import { registerPlugin } from "@capacitor/core";

export interface AudioMixPluginInterface {
  /** Configures AVAudioSession to .playback + .mixWithOthers so NativeAudio
   *  layers over Spotify/Apple Music without ducking or interrupting. */
  enableMixing(): Promise<{ success: boolean }>;
}

const AudioMixPlugin = registerPlugin<AudioMixPluginInterface>("AudioMixPlugin");

export default AudioMixPlugin;
