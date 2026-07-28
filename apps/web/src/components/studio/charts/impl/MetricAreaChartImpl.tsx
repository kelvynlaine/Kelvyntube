'use client';

import { useId } from 'react';
import type { TimeSeriesPointDTO } from '@kelvyntube/shared';
import { formatCompactNumber } from '@kelvyntube/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { useChartTheme } from '../chart-theme';
import { formatAxisDate, formatFullDate } from '../../studio-format';
import { ChartTooltipCard } from './ChartTooltipCard';

export interface MetricAreaChartProps {
  points: TimeSeriesPointDTO[];
  /** Couleur de la série (déjà résolue depuis les tokens). */
  color?: string;
  /** Nom de la métrique affiché dans l'infobulle. */
  seriesName: string;
  /** Formatage de la valeur dans l'infobulle. */
  formatValue: (value: number) => string;
  height?: number;
}

/**
 * Grand graphique de la vue d'ensemble : aire dégradée, axes discrets,
 * infobulle aux couleurs du thème et dates en français.
 */
export function MetricAreaChartImpl({
  points,
  color,
  seriesName,
  formatValue,
  height = 300,
}: MetricAreaChartProps) {
  const theme = useChartTheme();
  const gradientId = `kt-area-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stroke = color ?? theme.accent;

  const renderTooltip = (props: TooltipProps<number, string>) => {
    if (!props.active || !props.payload?.length) return null;
    const raw = props.payload[0]?.value;
    const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return (
      <ChartTooltipCard
        title={formatFullDate(String(props.label ?? ''))}
        rows={[{ label: seriesName, value: formatValue(value), color: stroke }]}
      />
    );
  };

  return (
    <div
      role="img"
      aria-label={`Évolution de la métrique « ${seriesName} » sur la période sélectionnée`}
      style={{ height }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            minTickGap={32}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactNumber(value)}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />

          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
          />

          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={stroke}
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
