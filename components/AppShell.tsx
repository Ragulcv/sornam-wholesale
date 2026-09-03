"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import IdleTimer from "./IdleTimer";
import OperatorSwitch from "./OperatorSwitch";

// Grouped for the mobile drawer, where there's room for structure — daily
// work, then position/reference, then admin. The desktop bar stays one flat row.
const NAV_GROUPS = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Today" },
      { href: "/entry", label: "Sales / Purchase" },
      { href: "/bookings", label: "Bookings" },
      { href: "/expenses", label: "Expenses" },
      { href: "/history", label: "History" },
    ],
  },
  {
    label: "Position",
    items: [
      { href: "/stock", label: "Stock" },
      { href: "/prices", label: "MCX Prices" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/parties", label: "Parties" },
      { href: "/settings", label: "Settings" },
    ],
  },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

export default function AppShell({
  children,
  autoLogoffMinutes,
  operatorName,
}: {
  children: React.ReactNode;
  autoLogoffMinutes: number;
  operatorName: string | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Close the drawer on navigation (adjust state during render on pathname
  // change, per React's guidance, rather than a setState-in-effect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMenuOpen(false);
  }

  // Close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navLinkCls = (href: string) =>
    `whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
      isActive(href)
        ? "bg-gradient-to-r from-[rgba(201,162,39,0.22)] to-[rgba(201,162,39,0.06)] text-gold-hi"
        : "text-[#b8b2a4] hover:bg-[#1b1a16] hover:text-ivory"
    }`;

  return (
    <div className="min-h-screen">
      <IdleTimer minutes={autoLogoffMinutes} />

      {/* Top navbar — frees the full viewport width for the dense entry/history grids. */}
      <header className="sticky top-0 z-30 border-b border-[#28261f] bg-onyx">
        <div className="flex items-center gap-3 px-3 py-1.5 sm:px-4">
          {/* Hamburger — mobile/tablet only */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ivory hover:bg-[#1b1a16] lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <div className="whitespace-nowrap font-serif text-[19px] font-bold tracking-wide text-ivory">
            Tracker
          </div>

          {/* Full nav row — desktop/large-tablet only */}
          <nav className="hidden flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={navLinkCls(n.href)}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto hidden shrink-0 lg:block">
            <OperatorSwitch name={operatorName} />
          </div>
        </div>
      </header>

      {/* Mobile/tablet nav drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[320px] flex-col border-r border-[#28261f] bg-onyx pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-serif text-[19px] font-bold tracking-wide text-ivory">Tracker</span>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ivory hover:bg-[#1b1a16]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-2">
              {NAV_GROUPS.map((g) => (
                <div key={g.label} className="mb-4">
                  <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-[#7c7668]">
                    {g.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((n) => (
                      <Link key={n.href} href={n.href} className={`${navLinkCls(n.href)} px-3 py-2.5 text-[15px]`}>
                        {n.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="border-t border-[#28261f] px-3 py-3">
              <OperatorSwitch name={operatorName} />
            </div>
          </div>
        </div>
      )}

      <main className="w-full flex-1 px-3 py-4 pb-24 sm:px-4">{children}</main>
    </div>
  );
}
