"use client";

import { useEffect, useRef, useState } from "react";

type Tab = { label: string; value: string };

interface AnimatedTabsProps {
  tabs: Tab[];
  activeValue?: string;
  onTabChange?: (value: string) => void;
}

export default function AnimatedTabs({ tabs, activeValue, onTabChange }: AnimatedTabsProps) {
  const isControlled = activeValue !== undefined;
  const [internalActive, setInternalActive] = useState(tabs[0]?.value ?? "");
  const currentValue = isControlled ? activeValue : internalActive;

  const [activeRect, setActiveRect] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.value === currentValue);
    const activeElement = tabRefs.current[activeIndex];

    if (activeElement) {
      setActiveRect({
        left: activeElement.offsetLeft,
        width: activeElement.offsetWidth,
      });
    }
  }, [currentValue, tabs]);

  const handleClick = (value: string) => {
    if (!isControlled) setInternalActive(value);
    onTabChange?.(value);
  };

  return (
    <div className="relative flex gap-3" style={{ fontFamily: "var(--font-bricolage), sans-serif" }}>
      {/* Base Layer - Inactive Tabs */}
      <div className="flex gap-3 relative z-10 w-max">
        {tabs.map((tab, idx) => (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            onClick={() => handleClick(tab.value)}
            className="px-5 py-[0.35rem] text-[0.94rem] font-bold tracking-[0.12em] border border-[#c8a64d] bg-[#10202a] text-[#d1dde2] transition-colors focus:outline-none"
            style={{ clipPath: "polygon(10% 0, 100% 0, 90% 100%, 0 100%)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Layer - Solid background & white text clipped to active tab */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{
          clipPath: `inset(0px calc(100% - (${activeRect.left}px + ${activeRect.width}px)) 0px ${activeRect.left}px round 9999px)`,
          transition: "clip-path 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex gap-3 w-max">
          {tabs.map((tab) => (
            <div
              key={tab.value}
              className="px-5 py-[0.35rem] text-[0.94rem] font-bold tracking-[0.12em] border border-[#d4af37] bg-linear-to-br from-[#e6c766] to-[#a88a2a] text-[#101820] flex items-center justify-center box-border"
              style={{ clipPath: "polygon(10% 0, 100% 0, 90% 100%, 0 100%)" }}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
