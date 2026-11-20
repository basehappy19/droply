'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/util';

/* ---------------- Icons (SF Symbols–style strokes) ---------------- */

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
    </>
  ),
  share: <path d="M12 15V4m0 0L8 8m4-4 4 4M6 11H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.3c2.4-.2 4 1.4 4.5 3.7" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7m4 4v6m4-6v6" />,
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.4-5.4 3.6-8 .3 1.8 1.4 3 2.6 3.4-.3-2.9.9-5.6 3.3-7.3-.2 2.9 1.1 4.6 2.4 6.3 1.1 1.4 1.6 2.8 1.6 4.6 0 4.1-3 7.1-7 7.1z" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />,
  doc: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zm0 0v5h5M9 13h6M9 17h4" />,
  code: <path d="m8.5 8-4 4 4 4m7-8 4 4-4 4M13.5 5l-3 14" />,
  text: <path d="M5 6h14M5 11h14M5 16h9" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  laptop: <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V15H5zM3 18h18" />,
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  door: <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" />,
  wand: <path d="m4 20 11-11m-2-2 2 2M17 3v3m-1.5-1.5h3M20 8v2m-1-1h2M9 4v2M8 5h2" />,
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 15.5a5 5 0 0 1 0-7m7 0a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8m12.8 0a9 9 0 0 1 0 12.8" />
    </>
  ),
  zip: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM11 5h1M12 7h1M11 9h1M12 11h1M11 13h2v3h-2z" />,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
};

export function Icon({ name, className, strokeWidth = 1.9 }: { name: keyof typeof PATHS | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={cx('size-5 shrink-0', className)} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cx('size-16 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="dr-bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="48%" stopColor="#0a84ff" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id="dr-sheen" x1="32" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="dr-ring" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#dr-bg)" />
      <rect x="2" y="2" width="60" height="30" rx="16" fill="url(#dr-sheen)" />
      <rect x="1.25" y="1.25" width="61.5" height="61.5" rx="17" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M18 38.5a15.5 15.5 0 1 1 28 0" fill="none" stroke="url(#dr-ring)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 45V20m0 0-9.5 9.5M32 20l9.5 9.5" fill="none" stroke="#ffffff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="51.5" r="3" fill="#ffffff" fillOpacity="0.92" />
    </svg>
  );
}

/* ---------------- Background: one static, faint colour wash (no blur filters, no animation) ---------------- */

export function Background() {
  return <div aria-hidden className="app-wash pointer-events-none fixed inset-0 -z-10" />;
}

/* ---------------- Controls ---------------- */

type Tone = 'blue' | 'red' | 'green' | 'gray' | 'orange';
const TONES: Record<Tone, string> = {
  blue: 'bg-gradient-to-b from-[#0077ed] to-[#005ec4] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_8px_24px_-6px_rgba(0,113,227,0.55)] hover:brightness-105',
  red: 'bg-ios-red/15 text-ios-red border border-ios-red/25 hover:bg-ios-red/20',
  green: 'bg-gradient-to-b from-[#248f40] to-[#1a7331] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_24px_-6px_rgba(36,138,61,0.48)] hover:brightness-105',
  orange: 'bg-ios-orange/15 text-ios-orange border border-ios-orange/25 hover:bg-ios-orange/20',
  gray: 'bg-fill border border-hairline shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:brightness-110',
};

export function Button({ tone = 'blue', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-3 text-[15px] font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        TONES[tone],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'grid size-10 cursor-pointer place-items-center rounded-full border transition-all duration-200 active:scale-90',
        active
          ? 'border-white/25 bg-ios-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_-3px_rgba(10,132,255,0.6)]'
          : 'border-hairline bg-fill shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] hover:brightness-115',
        className,
      )}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  labelledBy,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  labelledBy?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cx('relative grid rounded-[14px] border border-hairline bg-fill p-[3px]', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <div
        className="absolute bottom-[3px] top-[3px] rounded-[11px] bg-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_12px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] dark:bg-white/20 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_14px_rgba(0,0,0,0.35)]"
        style={{ left: 3, width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[11px] px-2.5 py-2 text-[13.5px] font-medium transition-colors', o.value === value ? 'font-semibold text-[var(--fg)]' : 'text-muted hover:text-[var(--fg)]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full border transition-all duration-300 disabled:opacity-40',
        checked
          ? 'border-white/20 bg-ios-green shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_16px_-2px_rgba(48,209,88,0.55)]'
          : 'border-hairline bg-fill shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]',
      )}
    >
      <span
        className={cx(
          'absolute left-0 top-[1.5px] size-[26px] rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.22),0_1px_2px_rgba(0,0,0,0.1)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)]',
          checked ? 'translate-x-[21.5px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/** iOS "inset grouped" Liquid Glass list. */
export function Group({ children, title, footer, className }: { children: ReactNode; title?: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h3 className="mb-1.5 px-4 text-[12.5px] font-medium uppercase tracking-wider text-muted">{title}</h3>}
      <div className="glass-inset divide-y divide-[var(--hairline)] overflow-hidden rounded-[18px]">{children}</div>
      {footer && <p className="mt-2 px-4 text-[12.5px] leading-relaxed text-muted">{footer}</p>}
    </section>
  );
}

export function Row({ icon, iconBg, title, subtitle, right, onClick, danger }: { icon?: string; iconBg?: string; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
        onClick && 'cursor-pointer hover:bg-white/[0.05] active:bg-fill',
        danger && 'text-ios-red',
      )}
    >
      {icon && (
        <span className={cx('grid size-[32px] shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_8px_-2px_rgba(0,0,0,0.35)]', iconBg ?? 'bg-ios-blue')}>
          <Icon name={icon} className="size-[18px]" strokeWidth={2.1} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[12.5px] text-muted">{subtitle}</span>}
      </span>
      {right}
    </Tag>
  );
}

/* ---------------- Sheet (Liquid Glass bottom sheet on phones, centred modal on desktop) ---------------- */

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="modal-backdrop absolute inset-0 animate-fade" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          'sheet-surface relative max-h-[88dvh] w-full animate-sheet overflow-y-auto rounded-t-[30px] px-4 pb-safe pt-2.5 outline-none sm:animate-pop sm:rounded-[30px] sm:px-6 sm:pb-6 sm:pt-5',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg md:max-w-[540px]',
        )}
      >
        <div className="mx-auto mb-2.5 h-[5px] w-10 rounded-full bg-white/30 sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-hairline bg-fill text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] transition hover:text-[var(--fg)] active:scale-90"
          >
            <Icon name="close" className="size-4" strokeWidth={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Confirm Modal (Liquid Glass, replaces browser confirm) ---------------- */

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'red' | 'orange' | 'blue';
  icon?: string;
}

const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

const CONFIRM_BTN: Record<'red' | 'orange' | 'blue', string> = {
  red: 'bg-gradient-to-b from-[#ff5e54] to-ios-red text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_24px_-6px_rgba(255,69,58,0.55)] hover:brightness-105',
  orange: 'bg-gradient-to-b from-[#ffb338] to-ios-orange text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_24px_-6px_rgba(255,159,10,0.5)] hover:brightness-105',
  blue: 'bg-gradient-to-b from-[#2c96ff] to-ios-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_24px_-6px_rgba(10,132,255,0.55)] hover:brightness-105',
};

const CONFIRM_ICON_BG: Record<'red' | 'orange' | 'blue', string> = {
  red: 'bg-gradient-to-b from-[#ff5e54] to-ios-red shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_22px_-6px_rgba(255,69,58,0.65)]',
  orange: 'bg-gradient-to-b from-[#ffb338] to-ios-orange shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_22px_-6px_rgba(255,159,10,0.6)]',
  blue: 'bg-gradient-to-b from-[#2c96ff] to-ios-blue shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_22px_-6px_rgba(10,132,255,0.6)]',
};

/* ---------------- Toasts ---------------- */

interface ToastItem {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
  action?: { label: string; run: () => void };
}
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone'], action?: ToastItem['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [dialog, setDialog] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const scheduleDismiss = useCallback((id: number, ms: number) => {
    const prev = timersRef.current.get(id);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      timersRef.current.delete(id);
      setItems((s) => s.filter((x) => x.id !== id));
    }, ms);
    timersRef.current.set(id, t);
  }, []);

  const push = useCallback(
    (text: string, tone: ToastItem['tone'] = 'info', action?: ToastItem['action']) => {
      const ttl = action ? 9000 : 3200;
      setItems((s) => {
        const existing = s.find((x) => x.text === text && x.tone === tone);
        if (existing) {
          scheduleDismiss(existing.id, ttl);
          return action ? s.map((x) => (x.id === existing.id ? { ...x, action } : x)) : s;
        }
        const id = Date.now() + Math.random();
        scheduleDismiss(id, ttl);
        return [...s.slice(-2), { id, text, tone, action }];
      });
    },
    [scheduleDismiss],
  );

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setDialog({ opts, resolve });
      }),
    [],
  );

  const closeDialog = useCallback((result: boolean) => {
    setDialog((d) => {
      d?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDialog(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  const tone = dialog?.opts.tone ?? 'red';

  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={push}>
        {children}

        {dialog && (
          <div className="fixed inset-0 z-[55] flex items-center justify-center p-5" role="alertdialog" aria-modal aria-labelledby="confirm-title" aria-describedby="confirm-desc">
            <div className="modal-backdrop absolute inset-0 animate-fade" onClick={() => closeDialog(false)} />
            <div className="sheet-surface relative w-full max-w-[380px] animate-pop rounded-[30px] p-6 text-center">
              {dialog.opts.icon && (
                <span className={cx('mx-auto mb-4 grid size-14 place-items-center rounded-[18px] text-white', CONFIRM_ICON_BG[tone])}>
                  <Icon name={dialog.opts.icon} className="size-7" strokeWidth={2.2} />
                </span>
              )}
              <h2 id="confirm-title" className="text-[18px] font-semibold tracking-tight">
                {dialog.opts.title}
              </h2>
              <p id="confirm-desc" className="mt-2 text-[14px] leading-relaxed text-muted">
                {dialog.opts.message}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-2.5">
                <Button tone="gray" onClick={() => closeDialog(false)} className="w-full py-2.5 text-[14.5px]">
                  {dialog.opts.cancelLabel ?? 'ยกเลิก'}
                </Button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => closeDialog(true)}
                  className={cx('inline-flex w-full cursor-pointer items-center justify-center rounded-full px-4 py-2.5 text-[14.5px] font-semibold transition-all duration-200 active:scale-[0.97]', CONFIRM_BTN[tone])}
                >
                  {dialog.opts.confirmLabel ?? 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4">
          {items.map((t) => (
            <div key={t.id} role="status" className="elevated pointer-events-auto flex max-w-md animate-pop items-center gap-3 rounded-full py-2.5 pl-4 pr-2.5 text-[14px] font-medium">
              <span className={cx('size-2 shrink-0 rounded-full', t.tone === 'error' ? 'bg-ios-red' : t.tone === 'success' ? 'bg-ios-green' : 'bg-ios-blue')} />
              <span className="pr-1.5">{t.text}</span>
              {t.action && (
                <button
                  className="rounded-full bg-ios-blue px-3 py-1 text-[13px] font-semibold text-white"
                  onClick={() => {
                    t.action!.run();
                    setItems((s) => s.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />;
}

export function DeviceIcon({ os, className }: { os: string; className?: string }) {
  const kind = os === 'iOS' || os === 'Android' ? 'phone' : os === 'iPadOS' ? 'tablet' : 'laptop';
  return <Icon name={kind} className={className} />;
}

const AVATAR_COLORS = ['bg-ios-blue', 'bg-ios-pink', 'bg-ios-green', 'bg-ios-purple', 'bg-ios-orange', 'bg-ios-indigo'];
export function Avatar({ id, os, size = 'md', ring }: { id: string; os: string; size?: 'sm' | 'md'; ring?: boolean }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-full text-white', AVATAR_COLORS[h % AVATAR_COLORS.length], size === 'sm' ? 'size-7' : 'size-10', ring && 'ring-2 ring-[var(--bg)]')}>
      <DeviceIcon os={os} className={size === 'sm' ? 'size-4' : 'size-5'} />
    </span>
  );
}
