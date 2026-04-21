'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type GradientTheme = {
  light: [string, string, string, string, string, string];
  dark: [string, string, string, string, string, string];
};

type InteractiveGradientBackgroundProps = {
  className?: string;
  children?: ReactNode;
  intensity?: number;
  interactive?: boolean;
  initialOffset?: { x?: number; y?: number };
  dark?: boolean;
  themes?: GradientTheme[];
  themeDurationMs?: number;
};

const defaultThemes: GradientTheme[] = [
  {
    light: [
      'rgb(211 255 215)',
      'rgb(200 200 200)',
      'rgb(250 255 0)',
      'rgb(20 175 125)',
      'rgb(255 77 0)',
      'rgb(255 0 0), rgb(120 86 255)',
    ],
    dark: [
      'rgb(15 30 20)',
      'rgb(80 80 100)',
      'rgb(100 120 0)',
      'rgb(10 80 60)',
      'rgb(120 35 0)',
      'rgb(100 0 0), rgb(60 40 150)',
    ],
  },
];

function buildBackground(
  palette: [string, string, string, string, string, string],
  isDark: boolean,
): string {
  const [c1, c2, c3, c4, c5, c6] = palette;
  const baseEnd = isDark ? 'rgb(0 0 0)' : 'rgb(0 0 0)';
  const radial2End = isDark ? 'rgb(10 0 25)' : 'rgb(22 0 45)';
  const radial3End = isDark ? 'rgb(15 0 0)' : 'rgb(36 0 0)';
  const radial4End = isDark ? 'rgb(0 5 120)' : 'rgb(0 10 255)';
  const radial5End = isDark ? 'rgb(0 100 140)' : 'rgb(0 200 255)';

  return `
    linear-gradient(115deg, ${c1}, ${baseEnd}),
    radial-gradient(90% 100% at calc(14% + var(--posX)*1px) calc(8% + var(--posY)*1px), ${c2}, ${radial2End}),
    radial-gradient(100% 100% at calc(28% - var(--posX)*1px) calc(4% - var(--posY)*1px), ${c3}, ${radial3End}),
    radial-gradient(150% 210% at calc(40% + var(--posX)*1px) calc(2% + var(--posY)*1px), ${c4}, ${radial4End}),
    radial-gradient(100% 100% at calc(34% - var(--posX)*1px) calc(18% - var(--posY)*1px), ${c5}, ${radial5End}),
    linear-gradient(60deg, ${c6})
  `;
}

export default function InteractiveGradientBackground({
  className = '',
  children,
  intensity = 1,
  interactive = true,
  initialOffset,
  dark = false,
  themes = defaultThemes,
  themeDurationMs = 7000,
}: InteractiveGradientBackgroundProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<PointerEvent | Touch | null>(null);
  const [activeTheme, setActiveTheme] = useState(0);

  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const host = ref.current;
      const ev = pendingRef.current;
      if (!host || !ev) return;

      const rect = host.getBoundingClientRect();
      const px = ('clientX' in ev ? ev.clientX : 0) - rect.left - rect.width / 2;
      const py = ('clientY' in ev ? ev.clientY : 0) - rect.top - rect.height / 2;

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const k = prefersReduced ? 0.1 : intensity;
      host.style.setProperty('--posX', String(px * k));
      host.style.setProperty('--posY', String(py * k));
    });
  };

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    host.style.setProperty('--posX', String(initialOffset?.x ?? 0));
    host.style.setProperty('--posY', String(initialOffset?.y ?? 0));

    if (!interactive) return;

    const onPointer = (e: PointerEvent) => {
      pendingRef.current = e;
      schedule();
    };

    const onTouch = (e: TouchEvent) => {
      if (!e.touches.length) return;
      pendingRef.current = e.touches[0];
      schedule();
    };

    const reset = () => {
      host.style.setProperty('--posX', '0');
      host.style.setProperty('--posY', '0');
    };

    host.addEventListener('pointermove', onPointer, { passive: true });
    host.addEventListener('touchmove', onTouch, { passive: true });
    host.addEventListener('pointerleave', reset);
    host.addEventListener('touchend', reset);
    host.addEventListener('touchcancel', reset);

    return () => {
      host.removeEventListener('pointermove', onPointer);
      host.removeEventListener('touchmove', onTouch);
      host.removeEventListener('pointerleave', reset);
      host.removeEventListener('touchend', reset);
      host.removeEventListener('touchcancel', reset);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [interactive, intensity, initialOffset?.x, initialOffset?.y]);

  useEffect(() => {
    if (themes.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveTheme((prev) => (prev + 1) % themes.length);
    }, themeDurationMs);

    return () => window.clearInterval(timer);
  }, [themes, themeDurationMs]);

  const rootStyle = {
    position: 'relative',
    width: '100%',
    minHeight: '100vh',
    overflow: 'hidden',
    '--posX': '0',
    '--posY': '0',
  } as CSSProperties & { '--posX': string; '--posY': string };

  return (
    <div
      ref={ref}
      aria-label="Interactive gradient background"
      role="img"
      className={className}
      style={rootStyle}
    >
      {themes.map((theme, idx) => {
        const palette = dark ? theme.dark : theme.light;
        return (
          <div
            key={`theme-${idx}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              opacity: idx === activeTheme ? 1 : 0,
              transition: 'opacity 1.2s ease',
              background: buildBackground(palette, dark),
              backgroundBlendMode:
                'overlay, overlay, difference, difference, difference, normal',
            }}
          />
        );
      })}

      {children ? <div style={{ position: 'relative', zIndex: 1 }}>{children}</div> : null}
    </div>
  );
}

export { InteractiveGradientBackground };
export type { GradientTheme, InteractiveGradientBackgroundProps };
