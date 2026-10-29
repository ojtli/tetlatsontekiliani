"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {getActiveTab, TABS} from "@/lib/tabs.ts";

export default function Header() {
  const activeTab = getActiveTab(usePathname());

  return (
    <header className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-b border-border bg-surface/90 backdrop-blur-md shrink-0 gap-4">
      {/* Brand logo & title */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
          <span className="text-accent font-bold text-sm">🌎</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-foreground tracking-tight">
            Tetlatsontekiliani
          </span>
          <span className="text-[11px] text-muted hidden md:inline">
            Tico Address Benchmark
          </span>
        </div>
      </div>

      {/* Inline Navigation Tabs */}
      <nav aria-label="Application Tabs" className="flex items-center gap-1 bg-surface-elevated/70 p-1 rounded-xl border border-border/70 shadow-inner">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              className={`
                flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium
                transition-all duration-150 cursor-pointer select-none
                ${
                  isActive
                    ? "bg-accent text-white shadow-sm font-semibold"
                    : "text-muted hover:text-foreground hover:bg-surface/60"
                }
              `}
            >
              <span className="text-sm" aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
