'use client';

import type { TimeSeriesPointDTO } from '@kelvyntube/shared';
import { formatCompactNumber } from '@kelvyntube/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { useChartTheme } from '../chart-theme';
import { ChartFrame } from '../ChartFrame';
import { formatDateTime, formatHour, formatNumber } from '../../studio-format';
import { ChartTooltipCard } from './ChartTooltipCard';

export interface HourlyBarsProps {
  points: TimeSeriesPointDTO[];
  seriesName?: string;
  height?: number;
  /** Hauteur réduite en mobile (cf. `ChartFrame`). */
  mobileHeight?: number;
}

/** Histogramme horaire du bloc « en temps réel » (48 dernières heures). */
export function HourlyBarsImpl({
  points,
  seriesName = 'Vues',
  height = 132,
  mobileHeight = 110,
}: HourlyBarsProps) {
  const theme = useChartTheme();

  const renderTooltip = (props: TooltipProps<number, string>) => {
    if (!props.active || !props.payload?.length) return null;
    const raw = props.payload[0]?.value;
    const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
    return (
      <ChartTooltipCard
        title={formatDateTime(String(props.label ?? ''))}
        rows={[{ label: seriesName, value: formatNumber(value), color: theme.accent }]}
      />
    );
  };

  return (
    <ChartFrame
      height={height}
      mobileHeight={mobileHeight}
      label={`${seriesName} heure par heure sur les 48 dernières heures`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatHour}
            tick={{ fill: theme.axis, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: theme.grid }}
            // 48 heures sur ~250 px utiles : on espace pour éviter la bouillie.
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactNumber(value)}
            tick={{ fill: theme.axis, fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            content={renderTooltip}
            cursor={{ fill: theme.grid, opacity: 0.4 }}
            wrapperStyle={{ zIndex: 10, outline: 'none' }}
          />
          <Bar
            dataKey="value"
            name={seriesName}
            fill={theme.accent}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
