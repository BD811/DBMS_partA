"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Box,
  FileText,
  LayoutDashboard,
  Package,
  RefreshCw,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { SignOutButton } from "@/components/layout/sign-out-button";

const NAV_ITEMS = [
  { href: "/dispatch", label: "Dispatch", icon: LayoutDashboard },
  { href: "/tickets", label: "Tickets", icon: AlertCircle },
  { href: "/jobs", label: "Jobs", icon: Wrench },
  { href: "/equipment", label: "Equipment", icon: Package },
  { href: "/contracts", label: "Contracts", icon: FileText },
  { href: "/renewals", label: "Renewals", icon: RefreshCw },
  { href: "/technicians", label: "Technicians", icon: Users },
  { href: "/parts", label: "Parts", icon: Box },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { org, person, membership, isAccounts } = useOrg();
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      !isAccounts || (item.href !== "/dispatch" && item.href !== "/technicians"),
  );

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <Link href="/dispatch" className="border-b border-slate-100 px-6 py-5">
        <span className="text-sm font-extrabold tracking-[0.18em] text-blue-800">
          SERVICEIQ
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">{org.name}</span>
      </Link>

      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                isActive
                  ? "bg-blue-50 text-blue-800"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
              href={href}
              key={href}
            >
              <Icon aria-hidden="true" size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4">
        <p className="truncate px-3 text-sm font-semibold text-slate-800">{person.full_name}</p>
        <p className="px-3 pb-2 text-xs capitalize text-slate-500">{membership.role}</p>
        <SignOutButton />
      </div>
    </aside>
  );
}
