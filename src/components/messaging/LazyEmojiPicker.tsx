import { lazy, Suspense } from "react";
import type { EmojiClickData } from "emoji-picker-react";

// The full emoji-picker-react bundle is ~150 KB gzipped. Load it only when
// the emoji popover is actually opened. Renders nothing while loading — the
// popover itself provides the visible surface.
const EmojiPickerImpl = lazy(async () => {
  const mod = await import("emoji-picker-react");
  const Picker = mod.default;
  const { Theme, EmojiStyle } = mod;
  return {
    default: (props: {
      onEmojiClick: (data: EmojiClickData) => void;
    }) => (
      <Picker
        theme={Theme.DARK}
        emojiStyle={EmojiStyle.NATIVE}
        lazyLoadEmojis
        onEmojiClick={props.onEmojiClick}
      />
    ),
  };
});

interface Props {
  onEmojiClick: (data: EmojiClickData) => void;
}

const LazyEmojiPicker = ({ onEmojiClick }: Props) => (
  <Suspense
    fallback={
      <div className="flex h-64 w-72 items-center justify-center rounded-md bg-background text-xs text-muted-foreground">
        Loading emoji…
      </div>
    }
  >
    <EmojiPickerImpl onEmojiClick={onEmojiClick} />
  </Suspense>
);

export default LazyEmojiPicker;
export type { EmojiClickData };
