import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Printer, ChevronDown, FileSpreadsheet, FileDown } from "lucide-react";
import { downloadCsv, type ExportCell } from "@/lib/export";

export interface PrintAction {
  label: string;
  onClick: () => void;
}

export interface ExportSpec {
  filename: string;
  headers: string[];
  getRows: () => ExportCell[][];
}

/**
 * The single unified Print / Export button (approved design — Diwan pattern).
 * One navy button per page; the menu carries every print action plus Excel
 * and CSV export. Separate Print/Excel buttons are no longer allowed.
 */
export function PrintExportButton({ prints = [], exportSpec }: { prints?: PrintAction[]; exportSpec?: ExportSpec }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="flex items-center gap-2 no-print" data-print-export>
          <Printer size={15} />
          <span>طباعة / تصدير</span>
          <ChevronDown size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {prints.map((p, i) => (
          <DropdownMenuItem key={i} onClick={p.onClick} className="gap-2">
            <Printer size={14} className="text-muted-foreground" />
            <span>{p.label}</span>
          </DropdownMenuItem>
        ))}
        {exportSpec && (
          <>
            <DropdownMenuItem onClick={() => downloadCsv(exportSpec.filename, exportSpec.headers, exportSpec.getRows())} className="gap-2">
              <FileSpreadsheet size={14} className="text-muted-foreground" />
              <span>Excel — تصدير</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadCsv(exportSpec.filename, exportSpec.headers, exportSpec.getRows(), { bom: false })} className="gap-2">
              <FileDown size={14} className="text-muted-foreground" />
              <span>CSV — تصدير</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
