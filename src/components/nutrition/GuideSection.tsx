import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

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
        <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      </CardContent>
    </Card>
  );
};

export { SECTION_ICONS };
export default GuideSection;
