import Link from "next/link";
import type { ReactNode } from "react";
import { NibaLogo } from "./logo";
import { logoutAction } from "@/lib/actions/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

/** Shared dashboard shell: glass sidebar + content column. Server component. */
export function Shell({
  nav,
  children,
  userLabel,
  accent
}: {
  nav: NavItem[];
  children: ReactNode;
  userLabel: string;
  accent?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="niba-ambient" />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 p-4 md:flex">
        <div className="glass glass-strong flex h-full flex-col p-4">
          <Link href="/" className="px-1 py-2">
            <NibaLogo size={28} />
          </Link>
          <nav className="mt-4 flex flex-1 flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:bg-sky-50 hover:text-[var(--ink)]"
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          {accent}
          <div className="mt-2 border-t border-[var(--card-border)] pt-3">
            <div className="truncate px-1 text-xs text-[var(--ink-soft)]" title={userLabel}>
              {userLabel}
            </div>
            <form action={logoutAction}>
              <button className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50">
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-4 md:p-6">
        {/* Mobile top bar */}
        <div className="glass mb-4 flex items-center justify-between p-3 md:hidden">
          <Link href="/">
            <NibaLogo size={24} />
          </Link>
          <form action={logoutAction}>
            <button className="text-sm text-rose-600">Log out</button>
          </form>
        </div>
        <div className="glass mb-4 flex gap-1 overflow-x-auto p-2 md:hidden">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--ink-soft)] hover:bg-sky-50">
              {item.icon} {item.label}
            </Link>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

export const CLIENT_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: "📊" },
  { href: "/app/connect", label: "Connect FB/IG", icon: "🔌" },
  { href: "/app/bot", label: "Bot settings", icon: "🤖" },
  { href: "/app/knowledge", label: "Knowledge", icon: "📚" },
  { href: "/app/orders", label: "Orders", icon: "🛒" },
  { href: "/app/handoff", label: "Handoff", icon: "🙋" },
  { href: "/app/analytics", label: "Analytics", icon: "📈" },
  { href: "/app/plan", label: "Plan", icon: "💳" },
  { href: "/app/settings", label: "Settings", icon: "⚙️" }
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "🛰️" },
  { href: "/admin/businesses", label: "Businesses", icon: "🏢" },
  { href: "/admin/logs", label: "Logs & errors", icon: "🧾" },
  { href: "/admin/settings", label: "App settings", icon: "⚙️" }
];
