import type { ReactNode } from "react";

type LoaderSize = "xs" | "sm" | "md" | "lg";
type LoaderVariant = "page" | "panel" | "inline";

type LoaderGlyphProps = {
  className?: string;
  label?: string;
  size?: LoaderSize;
};

type AppLoaderProps = LoaderGlyphProps & {
  subtitle?: string;
  variant?: LoaderVariant;
};

type LoadingButtonContentProps = {
  icon?: ReactNode;
  label: ReactNode;
  loading: boolean;
  loadingLabel?: ReactNode;
};

const glyphSizeClass: Record<LoaderSize, string> = {
  xs: "h-3.5 w-3.5 text-[7px]",
  sm: "h-4 w-4 text-[8px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-12 w-12 text-sm",
};

const variantClass: Record<LoaderVariant, string> = {
  page: "min-h-dvh bg-background px-4",
  panel: "min-h-36 rounded-2xl border border-border bg-card p-6 shadow-custom",
  inline: "rounded-xl border border-primary/15 bg-primary/5 px-3 py-2",
};

export function LoaderGlyph({ className = "", label = "Loading", size = "sm" }: LoaderGlyphProps) {
  return (
    <span
      aria-label={label}
      role="status"
      className={`relative inline-grid shrink-0 place-items-center rounded-full text-primary ${glyphSizeClass[size]} ${className}`}
    >
      <span className="absolute inset-0 rounded-full border border-primary/15" />
      <span className="absolute inset-0 rounded-full border border-transparent border-r-primary border-t-primary animate-spin" />
      <span className="font-black leading-none">W</span>
    </span>
  );
}

export function LoadingButtonContent({ icon, label, loading, loadingLabel }: LoadingButtonContentProps) {
  return (
    <>
      {loading ? <LoaderGlyph size="sm" label={typeof loadingLabel === "string" ? loadingLabel : "Loading"} /> : icon ?? null}
      <span>{loading ? loadingLabel ?? label : label}</span>
    </>
  );
}

export default function AppLoader({
  className = "",
  label = "Loading",
  size,
  subtitle,
  variant = "panel",
}: AppLoaderProps) {
  const resolvedSize = size || (variant === "page" ? "lg" : variant === "inline" ? "sm" : "md");

  return (
    <div className={`flex items-center justify-center ${variantClass[variant]} ${className}`}>
      <div className={`flex min-w-0 items-center ${variant === "inline" ? "gap-2" : "flex-col gap-3 text-center"}`}>
        <LoaderGlyph size={resolvedSize} label={label} />
        <div className="min-w-0">
          <p className={`${variant === "inline" ? "text-xs" : "text-sm"} font-bold text-foreground`}>{label}</p>
          {subtitle ? (
            <p className={`${variant === "inline" ? "text-[10px]" : "text-xs"} mt-0.5 text-muted-foreground`}>{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
