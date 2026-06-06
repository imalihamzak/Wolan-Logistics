import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "../../lib/utils";

const EMPTY_SELECT_VALUE = "__wolan_select_empty_value__";

export type CustomSelectOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

type CustomSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
  ariaLabel?: string;
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
  size?: "sm" | "default";
};

const toRadixValue = (value: string) => (value === "" ? EMPTY_SELECT_VALUE : value);
const fromRadixValue = (value: string) => (value === EMPTY_SELECT_VALUE ? "" : value);

export function CustomSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select option",
  disabled = false,
  disabledReason,
  ariaLabel,
  triggerClassName,
  contentClassName,
  itemClassName,
  size = "default",
}: CustomSelectProps) {
  return (
    <Select
      value={toRadixValue(value)}
      onValueChange={(nextValue) => onValueChange(fromRadixValue(nextValue))}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel || placeholder}
        title={disabled ? disabledReason : undefined}
        size={size}
        className={cn(
          "w-full cursor-pointer rounded-xl border-border bg-input px-3 text-left text-xs font-semibold text-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-9 py-2" : "h-11 py-2.5",
          triggerClassName
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        className={cn(
          "z-[80] max-h-72 rounded-xl border-border bg-popover/95 p-1 text-popover-foreground shadow-xl backdrop-blur",
          contentClassName
        )}
      >
        {options.map((option, index) => (
          <SelectItem
            key={`${option.value || EMPTY_SELECT_VALUE}-${index}`}
            value={toRadixValue(option.value)}
            disabled={option.disabled}
            title={typeof option.description === "string" ? option.description : undefined}
            className={cn(
              "cursor-pointer rounded-lg py-2.5 pr-8 text-xs font-semibold focus:bg-primary/10 focus:text-foreground data-[disabled]:cursor-not-allowed",
              itemClassName
            )}
          >
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
