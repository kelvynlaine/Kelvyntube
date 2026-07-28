'use client';

import dynamic from 'next/dynamic';
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

function ChartFallback({ height }: { height: number }) {
  return <Skeleton variant="rect" className="w-full rounded-kt" style={{ height }} />;
}

export const MetricAreaChart = dynamic(
  () => import('./impl/MetricAreaChartImpl').then((m) => m.MetricAreaChartImpl),
  { ssr: false, loading: () => <ChartFallback height={300} /> },
);

export const RetentionChart = dynamic(
  () => import('./impl/RetentionChartImpl').then((m) => m.RetentionChartImpl),
  { ssr: false, loading: () => <ChartFallback height={300} /> },
);

export const HourlyBars = dynamic(
  () => import('./impl/HourlyBarsImpl').then((m) => m.HourlyBarsImpl),
  { ssr: false, loading: () => <ChartFallback height={132} /> },
);

export { BreakdownBars } from './BreakdownBars';
export type { BreakdownRow } from './BreakdownBars';
