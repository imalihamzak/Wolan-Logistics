interface HeaderProps {
  title: string;
  subtitle?: string;
}

import Logo from "../assets/logo.jpeg";

export default function Header({ title, subtitle = "" }: HeaderProps) {
  return (
    <header data-cmp="Header" className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 pr-16 sm:gap-4 sm:px-6 sm:py-4 sm:pr-16 lg:pr-6">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white shadow-sm wolan-glow">
        <img
          src={Logo}
          alt="Wolan Logistics Logo"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-foreground truncate sm:text-xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{subtitle}</p> : null}
      </div>
    </header>
  );
}
