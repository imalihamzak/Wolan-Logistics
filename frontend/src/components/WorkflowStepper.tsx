import { CheckCircle2Icon } from "lucide-react";

type WorkflowStep = {
  label: string;
  helper?: string;
};

type WorkflowStepperProps = {
  steps: WorkflowStep[];
  currentStep: number;
  onStepClick?: (index: number) => void;
  compactMobile?: boolean;
};

export default function WorkflowStepper({ steps, currentStep, onStepClick, compactMobile = false }: WorkflowStepperProps) {
  return (
    <div className={compactMobile ? "grid grid-cols-4 gap-1.5 sm:gap-2" : "grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]"}>
      {steps.map((step, index) => {
        const complete = index < currentStep;
        const active = index === currentStep;
        const canClick = Boolean(onStepClick);

        return (
          <button
            key={step.label}
            type="button"
            onClick={() => onStepClick?.(index)}
            disabled={!canClick}
            title={canClick ? `Open ${step.label} step.` : "Step navigation is locked for this workflow. Use the Back or Continue controls."}
            className={`rounded-xl border transition-all duration-200 ${
              active
                ? "border-primary bg-primary/10 text-foreground shadow-custom"
                : complete
                  ? "border-success/30 bg-success/10 text-foreground"
                  : "border-border bg-background/70 text-muted-foreground"
            } ${compactMobile ? "px-1.5 py-2 text-center sm:px-3 sm:py-3 sm:text-left" : "px-3 py-3 text-left"} ${canClick ? "hover:-translate-y-0.5 hover:border-primary/50" : ""}`}
          >
            <div className={`flex items-center gap-2 ${compactMobile ? "justify-center sm:justify-start" : ""}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                complete ? "bg-success text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}>
                {complete ? <CheckCircle2Icon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={`${compactMobile ? "hidden text-[10px] sm:inline sm:text-xs" : "text-xs"} font-bold`}>{step.label}</span>
            </div>
            {step.helper ? <p className={`${compactMobile ? "hidden sm:block" : ""} mt-2 text-[11px] leading-relaxed text-muted-foreground`}>{step.helper}</p> : null}
          </button>
        );
      })}
    </div>
  );
}
