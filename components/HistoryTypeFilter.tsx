"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TYPES = ["sales", "purchase", "expense"] as const;

/** Type checkboxes that filter instantly on click — no separate "Go" click. */
export default function HistoryTypeFilter({ selected }: { selected: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle(t: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("type");
    const next = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    next.forEach((x) => params.append("type", x));
    router.push(`/history?${params.toString()}`);
  }

  return (
    <div className="mt-1 flex gap-3">
      {/* Hidden inputs so the From/To/Party "Go" submit (native GET) keeps the
          current type selection instead of dropping it. */}
      {selected.map((t) => <input key={t} type="hidden" name="type" value={t} />)}
      {TYPES.map((t) => (
        <label key={t} className="flex items-center gap-1 text-sm capitalize text-ink">
          <input type="checkbox" checked={selected.includes(t)} onChange={() => toggle(t)} /> {t}
        </label>
      ))}
    </div>
  );
}
