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
import { ChartFrame } from '../ChartFrame';
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
  /** Hauteur en desktop (à partir de feed-3). */
  height?: number;
  /** Hauteur en mobile — un graphique de 300 px mange tout l'écran d'un iPhone. */
  mobileHeight?: number;
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
  mobileHeight = 200,
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
    <ChartFrame
      height={height}
      mobileHeight={mobileHeight}
      label={`Évolution de la métrique « ${seriesName} » sur la période sélectionnée`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />

          {/*
            `minTickGap` généreux : sur 320 px de large, des dates tous les
            32 px se chevauchent et deviennent illisibles.
          */}
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactNumber(value)}
            tick={{ fill: theme.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />

          {/*
            `trigger="click"` n'existe pas ici : on garde le survol, mais un
            `activeDot` large donne une cible confortable au doigt sur tactile.
          */}
          <Tooltip
            content={renderTooltip}
            cursor={{ stroke: theme.axis, strokeDasharray: '3 3' }}
            wrapperStyle={{ zIndex: 10, outline: 'none' }}
          />

          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 6, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
