import React from "react";

/**
 * Renders coach-note plain text with line breaks preserved
 * and bare URLs auto-linked. Lines beginning with "- " or "* "
 * are styled as soft bullets. No markdown otherwise — input
 * stays a plain textarea on the coach side.
 */
const URL_RE = /(https?:\/\/[^\s]+)/g;

const renderLine = (line: string, key: React.Key) => {
  const parts = line.split(URL_RE);
  const isBullet = /^\s*[-*]\s+/.test(line);
  const cleaned = isBullet ? line.replace(/^\s*[-*]\s+/, "") : line;
  const segs = cleaned.split(URL_RE);
  return (
    <div key={key} className={isBullet ? "pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-primary" : ""}>
      {segs.map((seg, i) =>
        URL_RE.test(seg) ? (
          <a
            key={i}
            href={seg}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {seg}
          </a>
        ) : (
          <React.Fragment key={i}>{seg}</React.Fragment>
        )
      )}
    </div>
  );
};

const CoachNoteText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const lines = text.split("\n");
  return (
    <div className={`text-sm text-foreground whitespace-pre-wrap break-words space-y-1 ${className ?? ""}`}>
      {lines.map((l, i) => (l.length === 0 ? <div key={i} className="h-2" /> : renderLine(l, i)))}
    </div>
  );
};

export default CoachNoteText;
