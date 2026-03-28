import { ExternalLink } from "lucide-react";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
}

interface LinkPreviewCardProps {
  preview: LinkPreview;
  isOwn: boolean;
}

const LinkPreviewCard = ({ preview, isOwn }: LinkPreviewCardProps) => {
  const hostname = (() => {
    try {
      return new URL(preview.url).hostname.replace("www.", "");
    } catch {
      return preview.site_name || preview.url;
    }
  })();

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 rounded-lg overflow-hidden border border-border bg-card hover:bg-card/80 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title + description */}
      <div className="px-3 py-2.5 space-y-1">
        {preview.title && (
          <p className="text-sm font-semibold text-primary line-clamp-2 leading-snug">
            {preview.title}
          </p>
        )}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {preview.description}
          </p>
        )}
      </div>

      {/* Large image — Trainerize-style tall card */}
      {preview.image && (
        <div className="w-full aspect-video bg-muted">
          <img
            src={preview.image}
            alt={preview.title || "Link preview"}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Footer hostname */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border/50">
        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] text-muted-foreground truncate">{hostname}</span>
      </div>
    </a>
  );
};

export default LinkPreviewCard;
