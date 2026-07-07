"use client";

export interface ToolbarItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  danger?: boolean;
  primary?: boolean;
}

/** Logimax-style flat button row (Add / Save / Cancel / Edit / Delete / …). */
export default function Toolbar({ items }: { items: ToolbarItem[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <button
            key={i.label}
            onClick={i.onClick}
            disabled={i.disabled}
            className={`rounded-md border px-3 py-1.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              i.primary
                ? "gold-grad border-transparent text-onyx"
                : i.danger
                  ? "border-[#f1c9c4] bg-pearl text-neg hover:bg-[#fdecea]"
                  : "border-line bg-[#f3efe6] text-ink hover:bg-cream"
            }`}
          >
            {i.label}
          </button>
        ))}
    </div>
  );
}
