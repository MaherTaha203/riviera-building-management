import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadCsv, type ExportCell } from "@/lib/export";

/**
 * Shared "تصدير Excel" button (V1.1 §6). Every table page passes its headers
 * and a row mapper; the CSV/download mechanics live in one place (lib/export).
 */
export function ExcelExportButton({
  filename,
  headers,
  getRows,
  size = "default",
}: {
  filename: string;
  headers: string[];
  getRows: () => ExportCell[][];
  size?: "sm" | "default";
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className="flex items-center gap-1 no-print"
      onClick={() => downloadCsv(filename, headers, getRows())}
    >
      <Download size={14} />
      تصدير Excel
    </Button>
  );
}
