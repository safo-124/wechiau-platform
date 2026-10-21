import type { ReactNode } from 'react';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header>
      <h1 className="page-title">{title}</h1>
      {children && <p className="page-sub">{children}</p>}
    </header>
  );
}
