import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A type-to-filter dropdown (combobox) for data-driven choices — tenants,
// units, contracts, bank accounts — which grow long and are painful to scroll
// as a plain <Select>. Drop-in for the "__none__" selects: value/onChange are
// the option value ("" = nothing selected).
export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  clearLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "اختر",
  searchPlaceholder = "بحث…",
  emptyText = "لا نتائج",
  clearable = true,
  clearLabel = "بدون",
  id,
  className,
  disabled,
  invalid,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", invalid && "border-destructive", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" dir="rtl" className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearable && (
                <CommandItem value="__clear__" onSelect={() => { onChange(""); setOpen(false); }}>
                  <X className="me-2 h-4 w-4 opacity-60" />
                  {clearLabel}
                </CommandItem>
              )}
              {options.map((o) => (
                // The cmdk filter matches against `value`; include both the id
                // and label so typing either finds it, and keep it unique.
                <CommandItem key={o.value} value={`${o.value}|${o.label}`} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={cn("me-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
