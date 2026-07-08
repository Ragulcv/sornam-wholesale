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
    <div className="flex min-h-screen">
      <IdleTimer minutes={autoLogoffMinutes} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col bg-onyx px-4 py-6 text-[#cfc9bd] md:flex">
        <div className="mb-6 border-b border-[#28261f] px-2 pb-5">
          <div className="font-serif text-[22px] font-bold leading-none tracking-wide text-ivory">
            Tracker
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition ${
                isActive(n.href)
                  ? "bg-gradient-to-r from-[rgba(201,162,39,0.18)] to-[rgba(201,162,39,0.04)] text-gold-hi"
                  : "text-[#b8b2a4] hover:bg-[#1b1a16] hover:text-ivory"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 px-2 text-center text-[10px] text-[#5a554b]">v2 · bullion</div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-56">
        <header className="sticky top-0 z-20 border-b border-line2 bg-[rgba(245,241,232,0.85)] backdrop-blur-md">
          <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-5 py-2.5">
            <div className="flex gap-1 overflow-x-auto md:hidden">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    isActive(n.href) ? "bg-onyx text-gold-hi" : "text-mid hover:bg-cream"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </div>
            <div className="ml-auto">
              <OperatorSwitch name={operatorName} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-6 pb-24">
          {children}
        </main>
      </div>
    </div>
  );
}
