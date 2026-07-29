"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdleTimer from "./IdleTimer";
import OperatorSwitch from "./OperatorSwitch";

const NAV = [
  { href: "/", label: "Today" },
  { href: "/entry", label: "Sales / Purchase" },
  { href: "/bookings", label: "Bookings" },
  { href: "/expenses", label: "Expenses" },
  { href: "/history", label: "History" },
  { href: "/stock", label: "Stock" },
  { href: "/prices", label: "MCX Prices" },
  { href: "/parties", label: "Parties" },
  { href: "/settings", label: "Settings" },
];

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
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="min-h-screen">
      <IdleTimer minutes={autoLogoffMinutes} />

      {/* Top navbar — frees the full viewport width for the dense entry/history grids. */}
      <header className="sticky top-0 z-30 border-b border-[#28261f] bg-onyx">
        <div className="flex items-center gap-3 px-4 py-1.5">
          <div className="whitespace-nowrap font-serif text-[19px] font-bold tracking-wide text-ivory">
            Tracker
          </div>
          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  isActive(n.href)
                    ? "bg-gradient-to-r from-[rgba(201,162,39,0.22)] to-[rgba(201,162,39,0.06)] text-gold-hi"
                    : "text-[#b8b2a4] hover:bg-[#1b1a16] hover:text-ivory"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto shrink-0">
            <OperatorSwitch name={operatorName} />
          </div>
        </div>
      </header>

      <main className="w-full flex-1 px-4 py-4 pb-24">{children}</main>
    </div>
  );
}
