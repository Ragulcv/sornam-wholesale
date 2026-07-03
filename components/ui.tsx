import Link from "next/link";
import { paymentModeLabel, type PaymentMode } from "@/lib/format";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-[28px] font-bold leading-tight text-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-pearl shadow-[0_1px_2px_rgba(26,24,20,.04),0_8px_24px_-12px_rgba(26,24,20,.12)] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-mute">
        {label}
      </div>
      <div
        className={`num mt-1.5 text-2xl ${accent ? "gold-text" : "text-ink"}`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-mute">{hint}</div>}
    </Card>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-[#eef4ff] text-info border-[#d6e3fb]",
  partial: "bg-[#fff6e6] text-gold-deep border-[#f2e3bd]",
  completed: "bg-[#eaf6ef] text-pos border-[#cde9d8]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
        STATUS_STYLES[status] ?? "bg-cream text-mid border-line"
      }`}
    >
      {status}
    </span>
  );
}

const MODE_STYLES: Record<PaymentMode, string> = {
  cash: "bg-[#eaf6ef] text-pos border-[#cde9d8]",
  bank: "bg-[#eef4ff] text-info border-[#d6e3fb]",
  upi: "bg-[#f3edff] text-[#5b3fa0] border-[#e0d4f7]",
};

export function ModeBadge({ mode }: { mode: PaymentMode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${MODE_STYLES[mode]}`}
    >
      {paymentModeLabel[mode]}
    </span>
  );
}

export function MetalBadge({ metal }: { metal: "gold" | "silver" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] font-semibold ${
        metal === "gold" ? "text-gold-deep" : "text-[#6b7280]"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          metal === "gold" ? "bg-gold" : "bg-[#9aa6b2]"
        }`}
      />
      {metal === "gold" ? "Gold" : "Silver"}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
  cta,
}: {
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-mute">{hint}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="gold-grad mt-2 rounded-xl px-4 py-2 text-sm font-bold text-onyx"
        >
          {cta.label}
        </Link>
      )}
    </Card>
  );
}
