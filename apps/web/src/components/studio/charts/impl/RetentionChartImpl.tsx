'use client';

import { useId, useMemo } from 'react';
import { formatDuration } from '@kelvyntube/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { useChartTheme } from '../chart-theme';
import { formatPercent } from '../../studio-format';
import { ChartTooltipCard } from './ChartTooltipCard';

export interface RetentionChartProps {
  /** 100 points : `bucket` = centième de la vidéo, `pct` = % de spectateurs restants. */
  retention: { bucket: number; pct: number }[];
  /** Durée de la vidéo, pour convertir un bucket en horodatage. */
  durationSec: number;
  height?: number;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  COURBE DE RÉTENTION D'AUDIENCE — le graphique signature du Studio.
 *
 *  L'axe X est le pourcentage de la vidéo (0 → 100 %), l'axe Y la part de
 *  spectateurs encore présents. Une ligne de référence marque la rétention
 *  moyenne, et l'infobulle traduit chaque point en horodatage réel afin que
 *  le créateur sache exactement où son audience décroche.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function RetentionChartImpl({
  retention,
  durationSec,
  height = 300,
}: RetentionChartProps) {
  const theme = useChartTheme();
  const gradientId = `kt-retention-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const average = useMemo(() => {
    if (retention.length === 0) return 0;
    return retention.reduce((sum, point) => sum + point.pct, 0) / retention.length;
  }, [retention]);

  /** Bucket -> horodatage dans la vidéo (« 1:24 »). */
  const timestampOf = (bucket: number) =>
    formatDuration((bucket / 100) * Math.max(0, durationSec));

  const renderTooltip = (props: TooltipProps<number, string>) => {
    if (!props.active || !props.payload?.length) return null;
    const bucket = Number(props.label ?? 0);
    const raw = props.payload[0]?.value;
    const pct = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return (
      <ChartTooltipCard
        title={`${timestampOf(bucket)} — ${Math.round(bucket)} % de la vidéo`}
        rows={[
          { label: 'Spectateurs restants', value: formatPercent(pct), color: theme.accent },
          { label: 'Moyenne', value: formatPercent(average) },
        ]}
      />
    );
  };

  return (
    <div
      role="img"
      aria-label={`Courbe de rétention d'audience : ${formatPercent(average)} de spectateurs restants en moyenne`}
      style={{ height }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={retention} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.accent} stopOpacity={0.4} />
              <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="bucket"
            type="number"
            domain={[0, 99]}
            ticks={[0, 25, 50, 75, 99]}
            tickFormatter={(value: number) => `${Math.round(value)} %`}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(value: number) => `${Math.round(value)} %`}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />

          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
          />

          <ReferenceLine
            y={average}
            stroke={theme.fgMuted}
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
            label={{
              value: `Moyenne ${formatPercent(average)}`,
              position: 'insideTopRight',
              fill: theme.fgMuted,
              fontSize: 11,
            }}
          />

          <Area
            type="monotone"
            dataKey="pct"
            name="Spectateurs restants"
            stroke={theme.accent}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
