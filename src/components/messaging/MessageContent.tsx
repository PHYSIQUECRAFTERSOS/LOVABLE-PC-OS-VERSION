import { useMemo } from "react";
import LinkPreviewCard, { type LinkPreview } from "./LinkPreviewCard";

// Match URLs in text — supports http/https and www.
const URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;

interface MessageContentProps {
  content: string;
  isOwn: boolean;
  linkPreview?: LinkPreview | null;
}

/**
 * Renders message text with:
 * 1. Clickable blue links (URLs)
 * 2. Preserved whitespace/newlines
 * 3. Trainerize-style link preview card when a single link exists
 */
const MessageContent = ({ content, isOwn, linkPreview }: MessageContentProps) => {
  const parts = useMemo(() => {
    if (!content) return [];

    const result: Array<{ type: "text" | "link"; value: string }> = [];
    let lastIndex = 0;

    const regex = new RegExp(URL_REGEX.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      // Text before the match
      if (match.index > lastIndex) {
        result.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      result.push({ type: "link", value: match[0] });
      lastIndex = match.index + match[0].length;
    }

    // Remaining text
    if (lastIndex < content.length) {
      result.push({ type: "text", value: content.slice(lastIndex) });
    }

    return result;
  }, [content]);

  const getHref = (url: string) => {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
  };

  return (
    <div>
      <p className="whitespace-pre-wrap break-words">
        {parts.map((part, i) =>
          part.type === "link" ? (
            <a
              key={i}
              href={getHref(part.value)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 underline underline-offset-2 hover:text-sky-300 break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {part.value}
            </a>
          ) : (
            <span key={i}>{part.value}</span>
          )
        )}
      </p>
      {linkPreview && (
        <LinkPreviewCard preview={linkPreview} isOwn={isOwn} />
      )}
    </div>
  );
};

export default MessageContent;
