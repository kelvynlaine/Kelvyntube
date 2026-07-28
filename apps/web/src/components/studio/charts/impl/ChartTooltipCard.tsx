'use client';

import type { ReactNode } from 'react';

/**
 * Carte d'infobulle commune à tous les graphiques du Studio.
 * Elle utilise les tokens du preset : lisible en thème clair comme sombre.
 */
export function ChartTooltipCard({
  title,
  rows,
}: {
  title: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string }[];
}) {
  return (
    <div className="pointer-events-none rounded-kt border border-border bg-bg-elevated px-3 py-2 shadow-lg">
      <p className="mb-1 text-kt-sm font-medium text-fg">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2 text-kt-sm text-fg-muted">
            {row.color ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            ) : null}
            <span>{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-fg">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
