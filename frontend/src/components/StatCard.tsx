import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title?: string;
  value?: string;
  sub?: string;
  icon?: LucideIcon;
  gradient?: string;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({
  title = `Metric`,
  value = `0`,
  sub = ``,
  icon: Icon = undefined,
  gradient = `gradient-blue`,
  trend = ``,
  trendUp = true,
}: StatCardProps) {
  return (
    <div data-cmp="StatCard" className="bg-card rounded-xl border border-border p-4 flex flex-col gap-3 shadow-custom hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
          <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
        {Icon && (
          <div className={`w-10 h-10 ${gradient} rounded-xl flex items-center justify-center shadow-custom flex-shrink-0`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className={`text-xs font-medium ${trendUp ? `text-success` : `text-destructive`}`}>
        {trend}
      </div>
    </div>
  );
}
