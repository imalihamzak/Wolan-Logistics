import type { ReactNode } from "react";
import { Skeleton } from "./ui/skeleton";

const CardShell = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`min-w-0 max-w-full rounded-xl border border-border bg-card p-4 shadow-custom ${className}`}>
    {children}
  </div>
);

const HeaderLines = ({ wide = false }: { wide?: boolean }) => (
  <div className="min-w-0 space-y-2">
    <Skeleton className="h-3 w-24" />
    <Skeleton className={`h-5 ${wide ? "w-64" : "w-44"}`} />
    <Skeleton className="h-3 w-36" />
  </div>
);

const StatSkeleton = () => (
  <CardShell>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-3 w-full max-w-36" />
      </div>
      <Skeleton className="h-10 w-10 rounded-xl" />
    </div>
  </CardShell>
);

const PanelHeaderSkeleton = () => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <HeaderLines />
    <Skeleton className="h-9 w-9 rounded-xl" />
  </div>
);

const MiniRows = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-3 w-8" />
      </div>
    ))}
  </div>
);

const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-custom">
    <div className="border-b border-border px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <HeaderLines />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_0.8fr_0.8fr]">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-4 w-20 sm:justify-self-end" />
        </div>
      ))}
    </div>
  </div>
);

export function AdminDashboardSkeleton() {
  return (
    <div className="viewport-safe mx-auto flex w-full max-w-[2400px] flex-col gap-5">
      <div className="rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-full max-w-xl" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <StatSkeleton key={index} />)}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <CardShell>
          <PanelHeaderSkeleton />
          <div className="grid grid-cols-1 gap-2 border-t border-border pt-4 min-[420px]:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardShell>
        <CardShell><PanelHeaderSkeleton /><MiniRows rows={5} /></CardShell>
        <CardShell>
          <PanelHeaderSkeleton />
          <div className="grid gap-4 sm:grid-cols-[7.5rem_1fr]">
            <Skeleton className="mx-auto h-28 w-28 rounded-full" />
            <MiniRows rows={4} />
          </div>
        </CardShell>
        <CardShell>
          <PanelHeaderSkeleton />
          <div className="grid gap-4 sm:grid-cols-[7.5rem_1fr]">
            <Skeleton className="mx-auto h-28 w-28 rounded-full" />
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)}
            </div>
          </div>
        </CardShell>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <CardShell className="min-w-0">
          <PanelHeaderSkeleton />
          <Skeleton className="h-56 w-full rounded-xl sm:h-64 lg:h-72" />
        </CardShell>
        <CardShell>
          <PanelHeaderSkeleton />
          <Skeleton className="h-56 w-full rounded-xl sm:h-64 lg:h-72" />
        </CardShell>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <TableSkeleton rows={6} />
        <CardShell>
          <PanelHeaderSkeleton />
          <MiniRows rows={6} />
        </CardShell>
      </section>
    </div>
  );
}

export function ReportsSkeleton({ activeTab = "Overview" }: { activeTab?: string }) {
  const reportTab = activeTab || "Overview";

  return (
    <div className="viewport-safe flex flex-col gap-5">
      <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      {reportTab === "Overview" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <StatSkeleton key={index} />)}
          </section>

          <CardShell className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </CardShell>

          <section className="grid gap-4 xl:grid-cols-2">
            <CardShell className="p-5">
              <PanelHeaderSkeleton />
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-10 rounded-lg" />)}
              </div>
            </CardShell>
            <CardShell className="p-5">
              <PanelHeaderSkeleton />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <Skeleton className="h-3 w-36" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </CardShell>
          </section>
        </>
      ) : null}

      {reportTab === "Driver Performance" ? (
        <>
          <TableSkeleton rows={7} />
          <CardShell className="p-5">
            <PanelHeaderSkeleton />
            <Skeleton className="h-64 rounded-xl" />
          </CardShell>
        </>
      ) : null}

      {reportTab === "COD Reconciliation" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 2 }).map((_, panelIndex) => (
              <CardShell key={panelIndex} className="p-5">
                <PanelHeaderSkeleton />
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="space-y-2">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2.5 w-44" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              </CardShell>
            ))}
          </section>
        </>
      ) : null}

      {reportTab === "Zone Heatmap" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <CardShell key={index}>
                <div className="mb-2 flex items-center gap-2">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-7 w-16" />
                <Skeleton className="mt-2 h-3 w-32" />
              </CardShell>
            ))}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <CardShell className="p-5">
              <PanelHeaderSkeleton />
              <Skeleton className="mx-auto h-52 w-52 rounded-full" />
            </CardShell>
            <CardShell className="p-5">
              <PanelHeaderSkeleton />
              <Skeleton className="h-64 rounded-xl" />
            </CardShell>
          </section>
        </>
      ) : null}

      {reportTab === "Customer Reports" ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <CardShell className="p-5">
              <PanelHeaderSkeleton />
              <Skeleton className="h-64 rounded-xl" />
            </CardShell>
            <CardShell className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="mt-4 h-9 w-44 rounded-lg" />
            </CardShell>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function OrdersDispatchSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-card/50 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 min-w-[180px] flex-1 rounded-lg sm:max-w-xs" />
            <Skeleton className="h-10 min-w-[150px] flex-1 rounded-lg sm:flex-none" />
            <Skeleton className="h-10 min-w-[150px] flex-1 rounded-lg sm:flex-none" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-7 w-20 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>

        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="flex gap-1 overflow-hidden">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-24 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
          <div className="responsive-table-frame rounded-xl border border-border bg-card shadow-custom">
            <div className="grid min-w-[900px] gap-4 border-b border-border px-4 py-3" style={{ gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 0.9fr 0.7fr 0.6fr" }}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, rowIndex) => (
                <div key={rowIndex} className="grid min-w-[900px] items-center gap-4 px-4 py-3.5" style={{ gridTemplateColumns: "1fr 1.2fr 1fr 0.8fr 0.8fr 0.9fr 0.7fr 0.6fr" }}>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <div className="flex items-start gap-2">
                    <Skeleton className="mt-0.5 h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-28 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex gap-1.5">
                    <Skeleton className="h-7 w-7 rounded" />
                    <Skeleton className="h-7 w-7 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <aside className="max-h-[45dvh] w-full min-w-0 flex-shrink-0 overflow-hidden border-t border-border bg-card xl:max-h-none xl:w-80 xl:border-l xl:border-t-0">
        <div className="border-b border-border p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-40" />
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" />
          </div>

          <CardShell className="bg-muted p-3 shadow-none">
            <Skeleton className="mb-3 h-3 w-24" />
            <Skeleton className="h-12 rounded-lg" />
            <div className="mt-3 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </CardShell>

          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>

          <CardShell className="bg-muted p-3 shadow-none">
            <Skeleton className="mb-3 h-3 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-full" />
              ))}
            </div>
          </CardShell>

          <CardShell className="p-3 shadow-none">
            <Skeleton className="mb-3 h-3 w-28" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="mt-2 h-10 rounded-lg" />
          </CardShell>
        </div>
      </aside>
    </div>
  );
}

export function MerchantDashboardSkeleton() {
  return (
    <div className="content-scroll flex-1 space-y-6 px-4 py-4 sm:px-6 sm:py-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)}
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
        <div className="min-w-0 space-y-6">
          <CardShell className="p-5">
            <PanelHeaderSkeleton />
            <div className="grid gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-xl" />)}
            </div>
            <Skeleton className="mt-4 h-72 rounded-xl" />
            <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr]">
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
          </CardShell>
          <TableSkeleton rows={4} />
        </div>

        <aside className="min-w-0 space-y-6">
          <CardShell className="p-5">
            <PanelHeaderSkeleton />
            <Skeleton className="h-40 w-40 max-w-full rounded-lg" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-9 rounded-lg" />)}
            </div>
          </CardShell>
          <CardShell className="p-5">
            <PanelHeaderSkeleton />
            <Skeleton className="h-20 rounded-xl" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 rounded-lg" />)}
            </div>
          </CardShell>
        </aside>
      </section>
    </div>
  );
}

export function DriverDashboardSkeleton() {
  return (
    <div className="content-scroll flex-1 bg-linear-to-br from-background via-card/30 to-primary/5">
      <div className="viewport-safe space-y-6 px-4 py-4 sm:px-6 sm:py-6">
        <section className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)}
        </section>

        <CardShell className="rounded-3xl p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <HeaderLines />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-36 rounded-xl" />)}
          </div>
        </CardShell>

        <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="min-w-0 space-y-6">
            <CardShell className="rounded-3xl p-5">
              <PanelHeaderSkeleton />
              <div className="mt-5 grid gap-4 2xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-background/80 p-4">
                    <PanelHeaderSkeleton />
                    <div className="grid gap-3 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((__, tileIndex) => <Skeleton key={tileIndex} className="h-16 rounded-xl" />)}
                    </div>
                    <Skeleton className="mt-4 h-12 rounded-xl" />
                  </div>
                ))}
              </div>
            </CardShell>

            <section className="grid gap-6 xl:grid-cols-2">
              <CardShell className="rounded-3xl p-5">
                <PanelHeaderSkeleton />
                <Skeleton className="h-48 rounded-xl" />
              </CardShell>
              <CardShell className="rounded-3xl p-5">
                <PanelHeaderSkeleton />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}
                </div>
              </CardShell>
            </section>
          </div>

          <aside className="min-w-0 space-y-6">
            <CardShell className="rounded-3xl p-5">
              <PanelHeaderSkeleton />
              <Skeleton className="h-16 rounded-xl" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 10 }).map((_, index) => <Skeleton key={index} className="h-11 rounded-xl" />)}
              </div>
            </CardShell>
            <CardShell className="rounded-3xl p-5">
              <PanelHeaderSkeleton />
              <div className="space-y-3">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-12 rounded-2xl" />
              </div>
            </CardShell>
          </aside>
        </section>
      </div>
    </div>
  );
}
