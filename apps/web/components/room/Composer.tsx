'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, Segmented } from '@/components/ui';
import { LANGUAGES } from '@/lib/languages';
import { cx } from '@/lib/util';

const BURN_OPTIONS = [0, 1, 2, 3, 5, 10];

function LangSelect({ value, onChange, onOpen }: { value: string; onChange: (v: string) => void; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.id === value) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:w-44 sm:flex-none">
      <button
        type="button"
        aria-label="ภาษาโปรแกรม"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => {
            if (!o) onOpen?.();
            return !o;
          });
        }}
        className="flex h-full w-full cursor-pointer items-center justify-between gap-2 rounded-[14px] border border-hairline bg-fill px-3.5 text-[13.5px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:brightness-110 active:scale-[0.98]"
      >
        <span className="truncate">{current.label}</span>
        <Icon name="chevron" className={cx('size-4 shrink-0 text-muted transition-transform duration-200', open ? '-rotate-90' : 'rotate-90')} strokeWidth={2.2} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="เลือกภาษาโปรแกรม"
          className="sheet-surface absolute bottom-full left-0 z-30 mb-2 max-h-72 w-52 animate-pop overflow-y-auto rounded-[20px] p-1.5"
        >
          {LANGUAGES.map((l) => {
            const active = l.id === value;
            return (
              <button
                key={l.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(l.id);
                  setOpen(false);
                }}
                className={cx(
                  'flex w-full cursor-pointer items-center justify-between gap-2 rounded-[12px] px-3 py-2 text-left text-[13.5px] transition-colors',
                  active ? 'bg-ios-blue/20 font-semibold text-ios-blue dark:bg-white/15 dark:text-white' : 'text-[var(--fg)] hover:bg-fill',
                )}
              >
                <span className="truncate">{l.label}</span>
                {active && <Icon name="check" className="size-4 shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface ComposerHandle {
  insert: (text: string) => void;
}

export function Composer({
  disabled,
  disabledReason,
  onSend,
  onFiles,
  maxBytes,
  insertRef,
}: {
  disabled?: boolean;
  disabledReason?: string;
  onSend: (kind: 'text' | 'code', body: string, lang: string | undefined, burn: number) => Promise<boolean>;
  onFiles: (files: File[], burn: number) => void;
  maxBytes: number;
  insertRef: React.RefObject<ComposerHandle | null>;
}) {
  const [kind, setKind] = useState<'text' | 'code'>('text');
  const [lang, setLang] = useState('');
  const [text, setText] = useState('');
  const [burn, setBurn] = useState(0);
  const [burnOpen, setBurnOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  insertRef.current = {
    insert: (t: string) => {
      setText((prev) => (prev ? `${prev}\n${t}` : t));
      ta.current?.focus();
    },
  };

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, kind === 'code' ? 320 : 180)}px`;
  }, [text, kind]);

  const tooLong = new Blob([text]).size > maxBytes;

  async function send() {
    if (!text.trim() || sending || tooLong) return;
    setSending(true);
    const ok = await onSend(kind, text, kind === 'code' ? lang || undefined : undefined, burn);
    setSending(false);
    if (ok) {
      setText('');
      setBurn(0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // Text: Enter sends (Shift+Enter = new line). Code: Ctrl/Cmd+Enter sends.
    if ((kind === 'text' && !e.shiftKey && !coarse) || e.metaKey || e.ctrlKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="frost rounded-[26px] p-2">
      {disabled ? (
        <p className="flex items-center justify-center gap-2 px-3 py-3 text-[14px] text-muted">
          <Icon name="broadcast" className="size-4" /> {disabledReason}
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-stretch gap-2 px-1 pt-0.5">
            <Segmented
              value={kind}
              onChange={setKind}
              className="shrink-0"
              options={[
                { value: 'text', label: <><Icon name="text" className="hidden size-3.5 sm:block" />ข้อความ</> },
                { value: 'code', label: <><Icon name="code" className="hidden size-3.5 sm:block" />โค้ด</> },
              ]}
            />
            {kind === 'code' && <LangSelect value={lang} onChange={setLang} onOpen={() => setBurnOpen(false)} />}
            <div className="relative ml-auto flex items-center">
              <button
                onClick={() => setBurnOpen((o) => !o)}
                className={cx('flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold transition active:scale-95', burn ? 'bg-ios-orange text-white' : 'bg-fill text-muted')}
                aria-label="เผาหลังอ่าน"
                title="เผาหลังอ่าน/ดาวน์โหลด"
              >
                <Icon name="flame" className="size-4" />
                {burn ? burn : <span className="hidden sm:inline">เผาหลังอ่าน</span>}
              </button>
              {burnOpen && (
                <div className="elevated absolute bottom-full right-0 z-20 mb-2 w-56 animate-pop rounded-[18px] p-2">
                  <p className="px-2 pb-1.5 pt-1 text-[12px] text-muted">ทำลายข้อความ/ไฟล์ถัดไปเมื่อเปิดครบ</p>
                  <div className="grid grid-cols-3 gap-1">
                    {BURN_OPTIONS.map((n) => (
                      <button
                        key={n}
                        onClick={() => {
                          setBurn(n);
                          setBurnOpen(false);
                        }}
                        className={cx('rounded-[10px] py-2 text-[13px] font-medium', burn === n ? 'bg-ios-orange text-white' : 'bg-fill')}
                      >
                        {n ? `${n} ครั้ง` : 'ปิด'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              aria-label="แนบไฟล์"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-fill text-ios-blue transition active:scale-90"
            >
              <Icon name="plus" className="size-6" strokeWidth={2.4} />
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) onFiles(files, burn);
                setBurn(0);
                e.target.value = '';
              }}
            />
            <textarea
              ref={ta}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={kind === 'code' ? (touch ? 'วางโค้ดที่นี่…' : 'วางโค้ด… (Ctrl/⌘ + Enter เพื่อส่ง)') : touch ? 'ข้อความ…' : 'พิมพ์ข้อความ หรือวางรูป/ไฟล์ (Ctrl/⌘+V)…'}
              spellCheck={kind === 'text'}
              className={cx(
                'max-h-80 min-h-11 flex-1 resize-none rounded-[22px] border border-[var(--hairline)] bg-[var(--surface-2)] px-4 py-[11px] text-[15.5px] leading-[1.4] outline-none ring-ios-blue/50 placeholder:font-sans focus:ring-2',
                kind === 'code' && 'font-mono text-[13.5px]',
              )}
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending || tooLong}
              aria-label="ส่ง"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-ios-blue text-white transition active:scale-90 disabled:opacity-35"
            >
              <Icon name="send" className="size-5" strokeWidth={2.6} />
            </button>
          </div>
          {tooLong && <p className="px-3 pt-1.5 text-[12px] text-ios-red">ข้อความยาวเกิน 64 KB — ส่งเป็นไฟล์แทน</p>}
        </>
      )}
    </div>
  );
}
