import { type ReactNode } from "react";
import { fmtMoney, fmtDate } from "./index";

// ---------------------------------------------------------------------------
// Generic report table — drives every list/report print (units, tenants,
// contracts, cheques, receipt/payment registers, outstanding balances, etc.).
// ---------------------------------------------------------------------------
export interface Column<T> {
  label: string;
  render: (row: T, index: number) => ReactNode;
  className?: string;
}

export function ReportTable<T>({
  columns,
  rows,
  footer,
  emptyText = "لا توجد بيانات",
}: {
  columns: Column<T>[];
  rows: T[];
  footer?: ReactNode;
  emptyText?: string;
}) {
  return (
    <table className="print-table">
      <thead>
        <tr>
          <th style={{ width: "36px" }}>#</th>
          {columns.map((c, i) => (
            <th key={i} className={c.className}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "16px" }}>{emptyText}</td></tr>
        ) : (
          rows.map((row, ri) => (
            <tr key={ri}>
              <td className="ltr-nums">{ri + 1}</td>
              {columns.map((c, ci) => (
                <td key={ci} className={c.className}>{c.render(row, ri)}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {footer ? <tfoot>{footer}</tfoot> : null}
    </table>
  );
}

// ---------------------------------------------------------------------------
// Key/value document body (vouchers, contracts)
// ---------------------------------------------------------------------------
function KV({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="print-kv">
      {items.map(([label, value], i) => (
        <div className="row" key={i}>
          <span className="label">{label}</span>
          <span className="value">{value}</span>
        </div>
      ))}
    </div>
  );
}

const methodLabels: Record<string, string> = { cash: "نقداً", cheque: "شيك", bank_transfer: "تحويل بنكي" };

export function ReceiptVoucherDoc({ v }: { v: any }) {
  return (
    <div>
      <KV items={[
        ["التاريخ", <span className="ltr-nums">{fmtDate(v.date)}</span>],
        ["المستلم من", v.payerName],
        ["المستأجر", v.tenantName ?? "-"],
        ["رقم العقد", v.contractNumber ?? "-"],
        ["طريقة الدفع", methodLabels[v.paymentMethod] ?? v.paymentMethod],
        ["العملة", v.currency],
        ["المبلغ", <span className="ltr-nums">{fmtMoney(v.amount, v.currency)}</span>],
        ["سعر الصرف", <span className="ltr-nums">{v.exchangeRate}</span>],
      ]} />
      <div className="print-amount-box ltr-nums">المبلغ بالشيقل: {fmtMoney(v.amountILS, "ILS")}</div>
      {v.paymentMethod === "cheque" && (
        <KV items={[
          ["رقم الشيك", <span className="ltr-nums">{v.chequeNumber ?? "-"}</span>],
          ["البنك", v.bankName ?? "-"],
          ["تاريخ الاستحقاق", <span className="ltr-nums">{fmtDate(v.dueDate)}</span>],
        ]} />
      )}
      {v.notes && <p>ملاحظات: {v.notes}</p>}
      <div className="print-signatures">
        <div className="sig"><div className="line">المستلم</div></div>
        <div className="sig"><div className="line">المحاسب</div></div>
      </div>
    </div>
  );
}

export function PaymentVoucherDoc({ v }: { v: any }) {
  return (
    <div>
      <KV items={[
        ["التاريخ", <span className="ltr-nums">{fmtDate(v.date)}</span>],
        ["المستفيد", v.beneficiaryName],
        ["البند", v.category],
        ["طريقة الدفع", methodLabels[v.paymentMethod] ?? v.paymentMethod],
        ["العملة", v.currency],
        ["المبلغ", <span className="ltr-nums">{fmtMoney(v.amount, v.currency)}</span>],
        ["سعر الصرف", <span className="ltr-nums">{v.exchangeRate}</span>],
      ]} />
      <div className="print-amount-box ltr-nums">المبلغ بالشيقل: {fmtMoney(v.amountILS, "ILS")}</div>
      {v.notes && <p>ملاحظات: {v.notes}</p>}
      <div className="print-signatures">
        <div className="sig"><div className="line">المستلم</div></div>
        <div className="sig"><div className="line">المحاسب</div></div>
      </div>
    </div>
  );
}

const freqLabels: Record<string, string> = { monthly: "شهري", quarterly: "ربع سنوي", yearly: "سنوي" };

export function ContractDoc({ c }: { c: any }) {
  return (
    <div>
      <KV items={[
        ["المستأجر", c.tenantName ?? "-"],
        ["الوحدة", c.unitNumber ?? "-"],
        ["تاريخ البداية", <span className="ltr-nums">{fmtDate(c.startDate)}</span>],
        ["تاريخ النهاية", <span className="ltr-nums">{fmtDate(c.endDate)}</span>],
        ["قيمة الإيجار", <span className="ltr-nums">{fmtMoney(c.rentAmount, c.currency)}</span>],
        ["العملة", c.currency],
        ["سعر الصرف", <span className="ltr-nums">{c.exchangeRate}</span>],
        ["دورية الدفع", freqLabels[c.paymentFrequency] ?? c.paymentFrequency],
      ]} />
      <div className="print-amount-box ltr-nums">الإيجار بالشيقل: {fmtMoney(c.rentAmountILS, "ILS")}</div>
      {c.notes && <p>ملاحظات: {c.notes}</p>}
      <div className="print-signatures">
        <div className="sig"><div className="line">الطرف الأول (المؤجر)</div></div>
        <div className="sig"><div className="line">الطرف الثاني (المستأجر)</div></div>
      </div>
    </div>
  );
}

export function AccountStatementDoc({ statement }: { statement: any }) {
  const entries: any[] = statement?.entries ?? [];
  return (
    <div>
      <div className="print-meta">
        <span>المستأجر: {statement?.tenantName ?? "—"}</span>
        <span className="ltr-nums">الرصيد الافتتاحي: {fmtMoney(statement?.openingBalance, "ILS")}</span>
        <span className="ltr-nums">الرصيد الختامي: {fmtMoney(statement?.closingBalance, "ILS")}</span>
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البيان</th>
            <th>مدين</th>
            <th>دائن</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>لا توجد حركات</td></tr>
          ) : entries.map((e, i) => (
            <tr key={i}>
              <td className="ltr-nums">{fmtDate(e.date)}</td>
              <td>{e.description}</td>
              <td className="ltr-nums">{e.debit > 0 ? fmtMoney(e.debit, "ILS") : "-"}</td>
              <td className="ltr-nums">{e.credit > 0 ? fmtMoney(e.credit, "ILS") : "-"}</td>
              <td className="ltr-nums">{fmtMoney(e.balance, "ILS")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>الإجمالي</td>
            <td className="ltr-nums">{fmtMoney(statement?.totalDebit, "ILS")}</td>
            <td className="ltr-nums">{fmtMoney(statement?.totalCredit, "ILS")}</td>
            <td className="ltr-nums">{fmtMoney(statement?.closingBalance, "ILS")}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
