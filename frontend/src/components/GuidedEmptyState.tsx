import type { ElementType, ReactNode } from "react";
import { SparklesIcon } from "lucide-react";

type GuidedEmptyStateProps = {
  icon?: ElementType;
  title: string;
  description: string;
  action?: ReactNode;
};

export default function GuidedEmptyState({ icon: Icon = SparklesIcon, title, description, action }: GuidedEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-5 text-center shadow-custom">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
