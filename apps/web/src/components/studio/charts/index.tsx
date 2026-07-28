'use client';

import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';
import { Skeleton } from '@kelvyntube/ui';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CHARGEMENT DIFFÉRÉ DE RECHARTS
 *
 *  Recharts pèse lourd et manipule le DOM à la mesure : on l'isole derrière
 *  `next/dynamic` avec `ssr: false`. Chaque graphique est un module complet
 *  (recharts identifie ses sous-composants par type, ils doivent donc être
 *  importés statiquement *à l'intérieur* du module chargé dynamiquement).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Le squelette adopte la même hauteur responsive que le graphique final
 * (cf. `ChartFrame`) : sans cela, le passage du squelette au graphique
 * provoquerait un saut de mise en page de 100 px sur mobile.
 */
function ChartFallback({ height, mobileHeight }: { height: number; mobileHeight: number }) {
  return (
    <Skeleton
      variant="rect"
      className="h-[var(--kt-chart-h-sm)] w-full rounded-kt feed-3:h-[var(--kt-chart-h)]"
      style={
        {
          '--kt-chart-h': `${height}px`,
          '--kt-chart-h-sm': `${mobileHeight}px`,
        } as CSSProperties
      }
    />
  );
}

export const MetricAreaChart = dynamic(
  () => import('./impl/MetricAreaChartImpl').then((m) => m.MetricAreaChartImpl),
  { ssr: false, loading: () => <ChartFallback height={300} mobileHeight={200} /> },
);

export const RetentionChart = dynamic(
  () => import('./impl/RetentionChartImpl').then((m) => m.RetentionChartImpl),
  { ssr: false, loading: () => <ChartFallback height={300} mobileHeight={210} /> },
);

export const HourlyBars = dynamic(
  () => import('./impl/HourlyBarsImpl').then((m) => m.HourlyBarsImpl),
  { ssr: false, loading: () => <ChartFallback height={132} mobileHeight={110} /> },
);

export { BreakdownBars } from './BreakdownBars';
export type { BreakdownRow } from './BreakdownBars';
