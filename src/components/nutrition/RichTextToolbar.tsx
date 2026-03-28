import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, Heading2 } from "lucide-react";

interface RichTextToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (value: string) => void;
}

const insertMarkdown = (
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
  suffix: string = "",
  linePrefix: boolean = false
) => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.substring(start, end);

  let newText: string;
  let cursorPos: number;

  if (linePrefix) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const before = value.substring(0, lineStart);
    const lineContent = value.substring(lineStart, end);
    const after = value.substring(end);
    
    if (selected) {
      const lines = lineContent.split("\n");
      const prefixed = lines.map((l) => `${prefix}${l}`).join("\n");
      newText = before + prefixed + after;
      cursorPos = before.length + prefixed.length;
    } else {
      newText = before + prefix + lineContent + after;
      cursorPos = before.length + prefix.length + lineContent.length;
    }
  } else if (selected) {
    newText = value.substring(0, start) + prefix + selected + suffix + value.substring(end);
    cursorPos = start + prefix.length + selected.length + suffix.length;
  } else {
    newText = value.substring(0, start) + prefix + suffix + value.substring(end);
    cursorPos = start + prefix.length;
  }

  onChange(newText);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursorPos, cursorPos);
  });
};

const RichTextToolbar = ({ textareaRef, value, onChange }: RichTextToolbarProps) => {
  const actions = [
    { icon: Bold, label: "Bold", action: () => textareaRef.current && insertMarkdown(textareaRef.current, value, onChange, "**", "**") },
    { icon: Italic, label: "Italic", action: () => textareaRef.current && insertMarkdown(textareaRef.current, value, onChange, "*", "*") },
    { icon: List, label: "List", action: () => textareaRef.current && insertMarkdown(textareaRef.current, value, onChange, "- ", "", true) },
    { icon: Heading2, label: "Header", action: () => textareaRef.current && insertMarkdown(textareaRef.current, value, onChange, "## ", "", true) },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-md bg-muted/30 border border-border/50">
      {actions.map(({ icon: Icon, label, action }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={action}
          title={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
      <span className="text-[10px] text-muted-foreground ml-auto mr-1">Markdown</span>
    </div>
  );
};

export default RichTextToolbar;
