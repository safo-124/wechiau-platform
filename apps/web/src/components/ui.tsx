import type { DashboardTone } from '@wechiau/shared';
import type { ReactNode } from 'react';

/** Small building blocks matching the dashboard designs (web-dashboard/*.dc.html). */

export function Card({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {title || aside ? (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: DashboardTone; onClick?(): void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`stat ${tone ? `stat-${tone}` : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </Tag>
  );
}

export function Pill({ tone, children }: { tone: DashboardTone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Progress({ value, max }: { value: number; max: number }) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Notice({ tone, children }: { tone: DashboardTone; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: NoInfer<T>; onChange(v: NoInfer<T>): void }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`chip ${o.value === value ? 'chip-on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="muted">Loading {what}…</p>;
}

export function ErrorText({ error }: { error: Error | null }) {
  return error ? (
    <p className="error" role="alert">
      {error.message}
    </p>
  ) : null;
}
