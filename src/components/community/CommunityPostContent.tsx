import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LinkPreviewCard, { type LinkPreview } from "@/components/messaging/LinkPreviewCard";
import { Skeleton } from "@/components/ui/skeleton";

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;

interface CommunityPostContentProps {
  content: string;
}

const CommunityPostContent = ({ content }: CommunityPostContentProps) => {
  const parts = useMemo(() => {
    if (!content) return [];
    const result: Array<{ type: "text" | "link"; value: string }> = [];
    let lastIndex = 0;
    const regex = new RegExp(URL_REGEX.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: content.slice(lastIndex, match.index) });
      }
      result.push({ type: "link", value: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      result.push({ type: "text", value: content.slice(lastIndex) });
    }
    return result;
  }, [content]);

  const links = useMemo(() => parts.filter((p) => p.type === "link"), [parts]);
  const singleUrl = links.length === 1 ? links[0].value : null;

  const { data: preview, isLoading } = useQuery({
    queryKey: ["link-preview", singleUrl],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("fetch-link-preview", {
        body: { url: singleUrl },
      });
      if (data?.success && data.preview) return data.preview as LinkPreview;
      return null;
    },
    enabled: !!singleUrl,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const getHref = (url: string) =>
    url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;

  return (
    <div>
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
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
      {singleUrl && isLoading && (
        <Skeleton className="h-48 w-full mt-2 rounded-lg" />
      )}
      {preview && <LinkPreviewCard preview={preview} isOwn={false} />}
    </div>
  );
};

export default CommunityPostContent;
