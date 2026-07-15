import { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSmartDate, isoToDisplay, dateToIso } from "@/lib/smartDate";

// Lazy-load the calendar (react-day-picker) so it only downloads when a user
// actually opens the picker — the smart typing path stays lightweight.
const Calendar = lazy(() => import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })));

// A keyboard-first date field. Type loosely — "1/4", "01/04", "1.4.26" — and
// press Enter (or blur) to normalise; the current year fills in when omitted.
// A calendar popover is available for pointer users. Drop-in replacement for
// <Input type="date">: same contract (value/onChange are ISO "yyyy-mm-dd").
interface SmartDateInputProps {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  invalid?: boolean; // external validation error (e.g. required but empty)
}

export function SmartDateInput({ value, onChange, id, className, placeholder, invalid: invalidProp }: SmartDateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const [open, setOpen] = useState(false);
  const editing = useRef(false);
  const showInvalid = invalid || !!invalidProp;

  // Reflect external value changes (edit/reset) unless the user is mid-typing.
  useEffect(() => {
    if (!editing.current) setText(isoToDisplay(value));
  }, [value]);

  const commit = () => {
    const t = text.trim();
    if (!t) { setInvalid(false); setText(""); if (value) onChange(""); return; }
    const iso = parseSmartDate(t);
    if (iso) { setInvalid(false); setText(isoToDisplay(iso)); if (iso !== value) onChange(iso); }
    else setInvalid(true);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={text}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? "يوم/شهر/سنة"}
        aria-invalid={showInvalid || undefined}
        className={cn("ltr-nums text-start pl-9", showInvalid && "border-destructive focus-visible:ring-destructive")}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => { setText(e.target.value); if (invalid) setInvalid(false); }}
        onBlur={() => { editing.current = false; commit(); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            aria-label="اختر من التقويم"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarDays size={15} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Suspense fallback={<div className="p-4 text-xs text-muted-foreground">…</div>}>
            <Calendar
              mode="single"
              selected={value ? new Date(value + "T00:00:00") : undefined}
              onSelect={(d) => {
                if (d) { const iso = dateToIso(d); setText(isoToDisplay(iso)); setInvalid(false); if (iso !== value) onChange(iso); }
                setOpen(false);
              }}
            />
          </Suspense>
        </PopoverContent>
      </Popover>
    </div>
  );
}
