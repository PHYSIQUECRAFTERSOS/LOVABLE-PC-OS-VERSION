import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface GuideSectionProps {
  title: string;
  content: string;
  icon?: React.ReactNode;
}

const SECTION_ICONS: Record<string, string> = {
  water_recommendation: "💧",
  daily_ritual: "🌅",
  nutrition_tips: "📋",
  eating_out_cheat_sheet: "🍽️",
  eating_out_examples: "🍕",
  macro_cheat_sheet: "📊",
  additional_notes: "📝",
  meal_planning: "🥗",
};

const GuideSection = ({ title, content, icon }: GuideSectionProps) => {
  if (!content?.trim()) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon || <BookOpen className="h-4 w-4 text-primary" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm prose-invert max-w-none text-sm text-muted-foreground leading-relaxed [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-0.5">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
};

export { SECTION_ICONS };
export default GuideSection;
