import { switchOperatorAction, logoutAction } from "@/app/actions";

export default function OperatorSwitch({ name }: { name: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 rounded-lg border border-line bg-pearl px-3 py-1.5 text-xs font-semibold text-ink">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" strokeLinecap="round" />
        </svg>
        {name ?? "—"}
      </span>
      <form action={switchOperatorAction}>
        <button className="rounded-lg border border-line bg-pearl px-2.5 py-1.5 text-xs font-medium text-mid hover:bg-cream">
          Switch
        </button>
      </form>
      <form action={logoutAction}>
        <button className="rounded-lg border border-line bg-pearl px-2.5 py-1.5 text-xs font-medium text-mid hover:bg-cream">
          Lock
        </button>
      </form>
    </div>
  );
}
