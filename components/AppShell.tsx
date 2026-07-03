"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdleTimer from "./IdleTimer";
import PanicOverlay from "./PanicOverlay";

const NAV: { href: string; label: string; icon: React.ReactNode }[] = [
  { href: "/", label: "Today", icon: <IconHome /> },
  { href: "/new", label: "New booking", icon: <IconPlus /> },
  { href: "/bookings", label: "Bookings", icon: <IconBook /> },
  { href: "/ledger", label: "Ledger", icon: <IconLedger /> },
  { href: "/customers", label: "Customers", icon: <IconUsers /> },
  { href: "/settings", label: "Settings", icon: <IconGear /> },
];

export default function AppShell({
  children,
  autoLogoffMinutes,
}: {
  children: React.ReactNode;
  autoLogoffMinutes: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen">
      <IdleTimer minutes={autoLogoffMinutes} />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-onyx px-4 py-6 text-[#cfc9bd] md:flex">
        <div className="mb-6 border-b border-[#28261f] px-2 pb-5">
          <div className="font-serif text-[22px] font-bold leading-none tracking-wide text-ivory">
            Sornam
          </div>
          <div className="gold-text font-serif text-[15px] font-semibold tracking-wide">
            Wholesale
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                isActive(n.href)
                  ? "bg-gradient-to-r from-[rgba(201,162,39,0.18)] to-[rgba(201,162,39,0.04)] text-gold-hi"
                  : "text-[#b8b2a4] hover:bg-[#1b1a16] hover:text-ivory"
              }`}
            >
              <span className="h-[18px] w-[18px]">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 px-2 text-center text-[10px] leading-relaxed text-[#5a554b]">
          Sornam Wholesale · v1
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-line2 bg-[rgba(245,241,232,0.85)] backdrop-blur-md">
          <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-5 py-3">
            {/* Mobile nav */}
            <div className="flex gap-1 overflow-x-auto md:hidden">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    isActive(n.href)
                      ? "bg-onyx text-gold-hi"
                      : "text-mid hover:bg-cream"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <PanicOverlay />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6 pb-24">
          {children}
        </main>
      </div>
    </div>
  );
}

// ---- Inline icons -------------------------------------------------------

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" strokeLinejoin="round" />
      <path d="M4 19a2 2 0 0 1 2-2h13" />
    </svg>
  );
}
function IconLedger() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17 20a5.5 5.5 0 0 0-2-4.3" strokeLinecap="round" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" strokeLinecap="round" />
    </svg>
  );
}
