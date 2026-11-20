import type { ReactNode } from 'react';

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}]/gi;

/** Turns URLs in plain text into safe links (new tab, no opener/referrer). */
export function linkify(text: string, linkClass: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const raw = m[0];
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    let safe = true;
    try {
      safe = ['http:', 'https:'].includes(new URL(href).protocol);
    } catch {
      safe = false;
    }
    out.push(
      safe ? (
        <a key={start} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {raw}
        </a>
      ) : (
        raw
      ),
    );
    last = start + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const firstUrl = (text: string) => text.match(URL_RE)?.[0] ?? null;
