import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Shared advanced-filter bar (V1.1 §8) — one implementation reused by the
 * financial registers and the document center. Combines an optional date
 * range with any number of select filters; the page owns the state and
 * applies the predicate to its already-loaded list (client-side, no API
 * changes).
 */
export interface SelectFilterDef {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}

export function FilterBar({
  from,
  to,
  onFrom,
  onTo,
  dateLabel = "التاريخ",
  search,
  onSearch,
  searchLabel = "بحث",
  selects = [],
  onReset,
  resultCount,
}: {
  from?: string;
  to?: string;
  onFrom?: (v: string) => void;
  onTo?: (v: string) => void;
  dateLabel?: string;
  search?: string;
  onSearch?: (v: string) => void;
  searchLabel?: string;
  selects?: SelectFilterDef[];
  onReset: () => void;
  resultCount?: number;
}) {
  const hasDates = onFrom && onTo;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          {onSearch && (
            <div>
              <Label className="text-xs">{searchLabel}</Label>
              <Input value={search} onChange={e => onSearch(e.target.value)} placeholder="بحث..." className="mt-1 h-9" />
            </div>
          )}
          {hasDates && (
            <>
              <div>
                <Label className="text-xs">{dateLabel} — من</Label>
                <Input type="date" value={from} onChange={e => onFrom!(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">{dateLabel} — إلى</Label>
                <Input type="date" value={to} onChange={e => onTo!(e.target.value)} className="mt-1 h-9" />
              </div>
            </>
          )}
          {selects.map(s => (
            <div key={s.key}>
              <Label className="text-xs">{s.label}</Label>
              <Select value={s.value} onValueChange={s.onChange}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {s.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button variant="outline" className="h-9" onClick={onReset}>إعادة تعيين</Button>
        </div>
        {resultCount != null && (
          <p className="text-xs text-muted-foreground mt-2 ltr-nums">{resultCount} نتيجة</p>
        )}
      </CardContent>
    </Card>
  );
}
