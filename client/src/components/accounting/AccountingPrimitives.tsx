import { AlertCircle, CheckCircle2, Search } from "lucide-react";
import type { ReactNode } from "react";

type AccountOption = { code: string; name: string; accountType?: string; active?: number };

export function AccountSelector({ label = "الحساب", value, accounts, onChange, disabled = false }: { label?: string; value: string; accounts: AccountOption[]; onChange: (code: string) => void; disabled?: boolean }) {
  return <label className="accounting-field"><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">اختر الحساب</option>{accounts.filter((account) => account.active !== 0).map((account) => <option key={account.code} value={account.code}>{account.code} · {account.name}</option>)}</select></label>;
}

export function MoneyInput({ label, value, onChange, currency = "SAR", disabled = false }: { label: string; value: string; onChange: (value: string) => void; currency?: string; disabled?: boolean }) {
  return <label className="accounting-field"><span>{label} <small>{currency}</small></span><input inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.replace(/[^0-9.-]/g, ""))} /></label>;
}

export function SearchField({ value, onChange, placeholder = "بحث بالكود أو الاسم" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="accounting-search"><Search size={15} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export function ValidationSummary({ errors, success }: { errors: string[]; success?: string }) {
  if (!errors.length && !success) return null;
  return <div className={`accounting-validation ${errors.length ? "error" : "success"}`}>{errors.length ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<div>{errors.length ? errors.map((error) => <span key={error}>{error}</span>) : <span>{success}</span>}</div></div>;
}

export function AccountingPanel({ children, title, subtitle, actions }: { children: ReactNode; title: string; subtitle: string; actions?: ReactNode }) {
  return <section className="accounting-panel" dir="rtl"><header className="accounting-panel-header"><div><span className="financial-report-kicker">GENERAL LEDGER · LIVE DATABASE</span><h2>{title}</h2><p>{subtitle}</p></div>{actions}</header>{children}</section>;
}
