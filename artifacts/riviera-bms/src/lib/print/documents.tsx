import { type ReactNode } from "react";
import { fmtMoney, fmtNum, fmtDate } from "./index";

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

// Emphasized navy amount band (label on the right, value on the left).
function AmountBand({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="print-amount-box">
      <span className="t">{label}</span>
      <span className="v ltr-nums">{value}</span>
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
        ["الوحدة", v.unitNumber ? <span className="ltr-nums">{v.unitNumber}</span> : "-"],
        ["رقم العقد", v.contractNumber ? <span className="ltr-nums">{v.contractNumber}</span> : "-"],
        ["طريقة الدفع", methodLabels[v.paymentMethod] ?? v.paymentMethod],
        ["العملة", v.currency],
        ["سعر الصرف", <span className="ltr-nums">{v.exchangeRate}</span>],
      ]} />
      <AmountBand label="المبلغ المستلَم (بالشيكل)" value={fmtMoney(v.amountILS, "ILS")} />
      {v.paymentMethod === "cheque" && (
        <>
          <div className="print-sec">تفاصيل الشيك</div>
          <KV items={[
            ["رقم الشيك", <span className="ltr-nums">{v.chequeNumber ?? "-"}</span>],
            ["البنك", v.bankName ?? "-"],
            ["تاريخ الاستحقاق", <span className="ltr-nums">{fmtDate(v.dueDate)}</span>],
            ["اسم صاحب الحساب", v.accountHolderName ?? "-"],
          ]} />
        </>
      )}
      {v.notes && <div className="print-note"><b>ملاحظات:</b> {v.notes}</div>}
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
        ["سبب الصرف (البند)", v.category],
        ["طريقة الدفع", methodLabels[v.paymentMethod] ?? v.paymentMethod],
        ["الحساب / البنك", v.bankName ?? (methodLabels[v.paymentMethod] ?? "-")],
        ["العملة", v.currency],
        ["المبلغ", <span className="ltr-nums">{fmtMoney(v.amount, v.currency)}</span>],
        ["سعر الصرف", <span className="ltr-nums">{v.exchangeRate}</span>],
      ]} />
      <AmountBand label="المبلغ المصروف (بالشيكل)" value={fmtMoney(v.amountILS, "ILS")} />
      {v.notes && <div className="print-note"><b>ملاحظات:</b> {v.notes}</div>}
      <div className="print-signatures">
        <div className="sig"><div className="line">المستلم</div></div>
        <div className="sig"><div className="line">المحاسب</div></div>
        <div className="sig"><div className="line">المدير المالي</div></div>
      </div>
    </div>
  );
}

const freqLabels: Record<string, string> = { monthly: "شهري", quarterly: "ربع سنوي", yearly: "سنوي" };

export function ContractDoc({ c, attachments }: { c: any; attachments?: any[] }) {
  const items: any[] = [
    ["تاريخ البداية", <span className="ltr-nums">{fmtDate(c.startDate)}</span>],
    ["تاريخ النهاية", <span className="ltr-nums">{fmtDate(c.endDate)}</span>],
    ["قيمة الإيجار", <span className="ltr-nums">{fmtMoney(c.rentAmount, c.currency)}</span>],
    ["العملة", c.currency],
    ["سعر الصرف", <span className="ltr-nums">{c.exchangeRate}</span>],
    ["دورية الدفع", freqLabels[c.paymentFrequency] ?? c.paymentFrequency],
  ];
  if (c.depositAmount != null) items.push(["مبلغ التأمين", <span className="ltr-nums">{fmtMoney(c.depositAmount, c.currency)}</span>]);
  if (c.paymentCount != null) items.push(["عدد الدفعات", <span className="ltr-nums">{c.paymentCount}</span>]);
  if (c.paymentMethod) items.push(["طريقة الدفع", methodLabels[c.paymentMethod] ?? c.paymentMethod]);
  return (
    <div>
      <div className="print-ctx cols-3">
        <div className="c"><div className="l">المستأجر</div><div className="v">{c.tenantName ?? "-"}</div></div>
        <div className="c"><div className="l">الوحدة</div><div className="v ltr-nums">{c.unitNumber ?? "-"}</div></div>
        <div className="c"><div className="l">رقم العقد</div><div className="v ltr-nums">{c.contractNumber ?? "-"}</div></div>
      </div>
      <KV items={items} />
      <AmountBand label="الإيجار الشهري (بالشيكل)" value={fmtMoney(c.rentAmountILS, "ILS")} />
      {c.additionalTerms && <div className="print-note"><b>شروط إضافية:</b> {c.additionalTerms}</div>}
      {c.notes && <div className="print-note"><b>ملاحظات:</b> {c.notes}</div>}
      {attachments && attachments.length > 0 && (
        <>
          <div className="print-sec">مرفقات العقد</div>
          <div className="print-att">
            {attachments.map((a: any, i: number) => (
              <div className="it" key={i}>
                <span>{a.name}</span>
                <span className="ext">{String(a.fileType ?? "").toUpperCase()}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="print-signatures">
        <div className="sig"><div className="line">الطرف الأول (المؤجر)</div></div>
        <div className="sig"><div className="line">الطرف الثاني (المستأجر)</div></div>
      </div>
    </div>
  );
}

// Transaction-type labels for the account statement / cash fund ledgers.
const txTypeLabels: Record<string, { label: string; cls: string }> = {
  receipt_voucher: { label: "سند قبض", cls: "t-pos" },
  payment_voucher: { label: "سند صرف", cls: "t-neg" },
};

// The statement description is stored as "<voucherNumber> - <name>"; split it
// back into the voucher number and the remaining description for display.
function splitDesc(desc: string): { vno: string; rest: string } {
  const idx = (desc ?? "").indexOf(" - ");
  if (idx === -1) return { vno: "", rest: desc ?? "" };
  return { vno: desc.slice(0, idx), rest: desc.slice(idx + 3) };
}

export function AccountStatementDoc({ statement, from, to }: { statement: any; from?: string; to?: string }) {
  const entries: any[] = statement?.entries ?? [];
  const tenantName = statement?.tenantName;
  const periodLabel = (from || to) ? `${from ? fmtDate(from) : "البداية"} — ${to ? fmtDate(to) : "النهاية"}` : "كل الفترات";
  return (
    <div>
      <div className="print-ctx cols-2">
        <div className="c"><div className="l">الحساب</div><div className="v">{tenantName || "حساب العمارة"}</div></div>
        <div className="c"><div className="l">الفترة (من — إلى)</div><div className="v ltr-nums">{periodLabel}</div></div>
      </div>
      <div className="print-bar"><span className="t">الرصيد الافتتاحي</span><span className="v ltr-nums">{fmtMoney(statement?.openingBalance, "ILS")}</span></div>
      <div className="print-sec">حركات الحساب</div>
      <table className="print-table">
        <colgroup>
          <col style={{ width: "70px" }} /><col style={{ width: "74px" }} /><col style={{ width: "108px" }} />
          <col /><col style={{ width: "78px" }} /><col style={{ width: "78px" }} /><col style={{ width: "92px" }} />
        </colgroup>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>نوع الحركة</th>
            <th>رقم السند</th>
            <th>البيان</th>
            <th className="r">مدين</th>
            <th className="r">دائن</th>
            <th className="r col-bal">الرصيد الجاري</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: "center", padding: "16px" }}>لا توجد حركات</td></tr>
          ) : entries.map((e, i) => {
            const t = txTypeLabels[e.referenceType] ?? { label: "—", cls: "" };
            const { vno, rest } = splitDesc(e.description);
            return (
              <tr key={i}>
                <td className="ltr-nums">{fmtDate(e.date)}</td>
                <td><span className={t.cls} style={{ fontWeight: 600 }}>{t.label}</span></td>
                <td><span className="vno ltr-nums">{vno || "-"}</span></td>
                <td>{rest}</td>
                <td className="r ltr-nums">{e.debit > 0 ? fmtNum(e.debit) : <span className="dash">—</span>}</td>
                <td className="r ltr-nums">{e.credit > 0 ? fmtNum(e.credit) : <span className="dash">—</span>}</td>
                <td className="r col-bal ltr-nums">{fmtNum(e.balance)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>الإجماليات والرصيد الحالي</td>
            <td className="r ltr-nums">{fmtNum(statement?.totalDebit)}</td>
            <td className="r ltr-nums">{fmtNum(statement?.totalCredit)}</td>
            <td className="r col-bal ltr-nums">{fmtNum(statement?.closingBalance)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function CashFundDoc({ fund, transactions }: { fund: any; transactions: any[] }) {
  const txs = transactions ?? [];
  const totalCredit = txs.reduce((s, t) => s + (Number(t.credit) || 0), 0);
  const totalDebit = txs.reduce((s, t) => s + (Number(t.debit) || 0), 0);
  const closing = Number(fund?.balanceILS ?? (txs.length ? txs[txs.length - 1].balance : 0));
  return (
    <div>
      <div className="print-ctx cols-4">
        <div className="c"><div className="l">الرصيد الافتتاحي</div><div className="v ltr-nums">{fmtMoney(0, "ILS")}</div></div>
        <div className="c"><div className="l">إجمالي المقبوضات</div><div className="v ltr-nums" style={{ color: "#15803d" }}>{fmtMoney(totalCredit, "ILS")}</div></div>
        <div className="c"><div className="l">إجمالي المدفوعات</div><div className="v ltr-nums" style={{ color: "#b3261e" }}>{fmtMoney(totalDebit, "ILS")}</div></div>
        <div className="c"><div className="l">الرصيد الختامي</div><div className="v ltr-nums">{fmtMoney(closing, "ILS")}</div></div>
      </div>
      <div className="print-sec">حركات الصندوق النقدي</div>
      <table className="print-table">
        <colgroup>
          <col style={{ width: "74px" }} /><col /><col style={{ width: "94px" }} /><col style={{ width: "94px" }} /><col style={{ width: "98px" }} />
        </colgroup>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>البيان</th>
            <th className="r">مقبوضات</th>
            <th className="r">مدفوعات</th>
            <th className="r col-bal">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {txs.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: "center", padding: "16px" }}>لا توجد حركات</td></tr>
          ) : txs.map((t, i) => (
            <tr key={i}>
              <td className="ltr-nums">{fmtDate(t.date)}</td>
              <td>{t.description}</td>
              <td className="r ltr-nums">{t.credit > 0 ? <span className="t-pos">{fmtNum(t.credit)}</span> : <span className="dash">—</span>}</td>
              <td className="r ltr-nums">{t.debit > 0 ? <span className="t-neg">{fmtNum(t.debit)}</span> : <span className="dash">—</span>}</td>
              <td className="r col-bal ltr-nums">{fmtNum(t.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>الإجمالي والرصيد الختامي</td>
            <td className="r ltr-nums">{fmtNum(totalCredit)}</td>
            <td className="r ltr-nums">{fmtNum(totalDebit)}</td>
            <td className="r col-bal ltr-nums">{fmtNum(closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Financial summary print body (KPIs + breakdowns). Receives values already
// computed on the Reports page so the printed figures match the screen exactly.
export function FinancialSummaryDoc({
  periodLabel, totalReceipts, totalPayments, totalMonthlyRent, occupancyPct,
  cashBalance, paymentsByCategory, receiptsByMethod,
}: {
  periodLabel: string;
  totalReceipts: number;
  totalPayments: number;
  totalMonthlyRent: number;
  occupancyPct: number;
  cashBalance: number;
  paymentsByCategory: Array<[string, number]>;
  receiptsByMethod: Array<[string, number]>;
}) {
  const net = totalReceipts - totalPayments;
  const pct = (amount: number, total: number) => (total > 0 ? `${Math.round((amount / total) * 1000) / 10}%` : "0%");
  return (
    <div>
      <div className="print-bar"><span className="t">فترة التقرير</span><span className="v ltr-nums">{periodLabel}</span></div>
      <div className="print-sgrid">
        <div className="print-scard"><div className="l">إجمالي المقبوضات</div><div className="v ltr-nums" style={{ color: "#15803d" }}>{fmtMoney(totalReceipts, "ILS")}</div></div>
        <div className="print-scard"><div className="l">إجمالي المصروفات</div><div className="v ltr-nums" style={{ color: "#b3261e" }}>{fmtMoney(totalPayments, "ILS")}</div></div>
        <div className="print-scard em"><div className="l">صافي الحركة</div><div className="v ltr-nums">{fmtMoney(net, "ILS")}</div></div>
        <div className="print-scard"><div className="l">الإيجار الشهري المتوقع</div><div className="v ltr-nums">{fmtMoney(totalMonthlyRent, "ILS")}</div></div>
        <div className="print-scard"><div className="l">نسبة الإشغال</div><div className="v ltr-nums">{occupancyPct}%</div></div>
        <div className="print-scard"><div className="l">رصيد الصندوق النقدي</div><div className="v ltr-nums">{fmtMoney(cashBalance, "ILS")}</div></div>
      </div>
      {paymentsByCategory.length > 0 && (
        <>
          <div className="print-sec">المصروفات حسب البند</div>
          <table className="print-table">
            <colgroup><col /><col style={{ width: "130px" }} /><col style={{ width: "90px" }} /></colgroup>
            <thead><tr><th>البند</th><th className="r">المبلغ (₪)</th><th className="r">النسبة</th></tr></thead>
            <tbody>
              {paymentsByCategory.map(([cat, amount], i) => (
                <tr key={i}><td>{cat}</td><td className="r ltr-nums">{fmtNum(amount)}</td><td className="r ltr-nums">{pct(amount, totalPayments)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>الإجمالي</td><td className="r ltr-nums">{fmtNum(totalPayments)}</td><td className="r ltr-nums">100%</td></tr></tfoot>
          </table>
        </>
      )}
      {receiptsByMethod.length > 0 && (
        <>
          <div className="print-sec">المقبوضات حسب طريقة الدفع</div>
          <table className="print-table">
            <colgroup><col /><col style={{ width: "130px" }} /><col style={{ width: "90px" }} /></colgroup>
            <thead><tr><th>طريقة الدفع</th><th className="r">المبلغ (₪)</th><th className="r">النسبة</th></tr></thead>
            <tbody>
              {receiptsByMethod.map(([method, amount], i) => (
                <tr key={i}><td>{method}</td><td className="r ltr-nums">{fmtNum(amount)}</td><td className="r ltr-nums">{pct(amount, totalReceipts)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>الإجمالي</td><td className="r ltr-nums">{fmtNum(totalReceipts)}</td><td className="r ltr-nums">100%</td></tr></tfoot>
          </table>
        </>
      )}
    </div>
  );
}
