import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { NavItem } from '../data';

type Props = {
  navItems: NavItem[];
  onNavigate: (to: string) => void;
};

export default function FloatingMorphHeader({ navItems, onNavigate }: Props) {
  const [openDesktopDropdown, setOpenDesktopDropdown] = useState<string | null>(null);
  const headerMorphRef = useRef<HTMLDivElement | null>(null);
  const headerMorphTargetRef = useRef(0);
  const headerMorphCurrentRef = useRef(0);
  const headerMorphRafRef = useRef(0);

  useEffect(() => {
    const applyMorph = (value: number) => {
      if (!headerMorphRef.current) {
        return;
      }

      headerMorphRef.current.style.setProperty('--header-morph', value.toFixed(4));
    };

    const animateMorph = () => {
      const current = headerMorphCurrentRef.current;
      const target = headerMorphTargetRef.current;
      const next = current + (target - current) * 0.24;
      const isSettled = Math.abs(target - next) < 0.0015;
      const finalValue = isSettled ? target : next;

      headerMorphCurrentRef.current = finalValue;
      applyMorph(finalValue);

      if (!isSettled) {
        headerMorphRafRef.current = window.requestAnimationFrame(animateMorph);
        return;
      }

      headerMorphRafRef.current = 0;
    };

    const scheduleMorph = () => {
      if (headerMorphRafRef.current !== 0) {
        return;
      }

      headerMorphRafRef.current = window.requestAnimationFrame(animateMorph);
    };

    const updateMorphTarget = () => {
      const progress = Math.min(window.scrollY / 160, 1);
      headerMorphTargetRef.current = progress;
      scheduleMorph();
    };

    applyMorph(0);
    updateMorphTarget();

    window.addEventListener('scroll', updateMorphTarget, { passive: true });
    window.addEventListener('resize', updateMorphTarget, { passive: true });

    return () => {
      if (headerMorphRafRef.current !== 0) {
        window.cancelAnimationFrame(headerMorphRafRef.current);
        headerMorphRafRef.current = 0;
      }

      window.removeEventListener('scroll', updateMorphTarget);
      window.removeEventListener('resize', updateMorphTarget);
    };
  }, []);

  const headerStyle: CSSProperties = {
    ['--header-morph' as string]: 0,
    marginTop: 'calc(24px * (1 - var(--header-morph)))',
    paddingLeft: 'calc(16px * (1 - var(--header-morph)))',
    paddingRight: 'calc(16px * (1 - var(--header-morph)))',
  };

  const barStyle: CSSProperties = {
    maxWidth: 'calc(1080px + (100vw - 1080px) * var(--header-morph))',
    borderRadius: 'calc(9999px * (1 - var(--header-morph)))',
    paddingLeft: 'calc(20px + 12px * var(--header-morph))',
    paddingRight: 'calc(20px + 12px * var(--header-morph))',
    backgroundColor: 'rgb(255 255 255 / calc(0.75 + 0.2 * var(--header-morph)))',
    boxShadow:
      '0 calc(6px + 8px * var(--header-morph)) calc(26px + 18px * var(--header-morph)) rgb(15 23 42 / calc(0.08 + 0.08 * var(--header-morph)))',
    borderBottomWidth: 'calc(1px * var(--header-morph))',
    borderBottomColor: 'rgba(15,23,42,0.1)',
  };

  return (
    <header ref={headerMorphRef} style={headerStyle} className="fixed inset-x-0 top-0 z-30 flex justify-center will-change-transform">
      <div style={barStyle} className="flex w-full items-center justify-between border border-black/10 py-3 backdrop-blur-3xl">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="cursor-pointer text-sm font-medium tracking-[0.22em] text-[#0f172a] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-black"
        >
          ICAN
        </button>

        <nav className="hidden items-center gap-3 md:flex">
          {navItems.map(item => (
            <div
              key={item.label}
              className="relative"
              onMouseEnter={() => setOpenDesktopDropdown(item.children ? item.label : null)}
              onMouseLeave={() => setOpenDesktopDropdown(null)}
            >
              <button
                type="button"
                onClick={() => {
                  if (item.to) {
                    onNavigate(item.to);
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-[#334155] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[#0f172a]"
              >
                {item.label}
                {item.children ? <span className="text-[11px]">▾</span> : null}
              </button>

              {item.children ? (
                <div
                  className={`absolute left-0 top-full min-w-55 pt-2 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${openDesktopDropdown === item.label ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
                >
                  <div className="rounded-2xl border border-black/10 bg-white p-2 shadow-[0_14px_34px_rgba(15,23,42,0.12)]">
                    {item.children.map(child => (
                      <button
                        key={child.label}
                        type="button"
                        onClick={() => onNavigate(child.to)}
                        className="block w-full cursor-pointer rounded-xl px-3 py-2 text-center text-xs uppercase tracking-[0.12em] text-[#334155] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                      >
                        {child.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/authentication')}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-black/15 bg-white px-5 text-xs uppercase tracking-[0.14em] text-[#334155] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-[#0f172a]"
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/authentication?view=register')}
            className="group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-[#0f172a] px-5 text-xs uppercase tracking-[0.14em] text-white transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[#1e293b] active:scale-[0.98]"
          >
            Register
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[11px] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-y-px group-hover:translate-x-1">
              ↗
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
