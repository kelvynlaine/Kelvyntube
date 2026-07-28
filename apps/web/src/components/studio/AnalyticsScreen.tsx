'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Clock3, Euro, Eye, MousePointerClick, Radio, Users } from 'lucide-react';
import {
  ROUTES,
  formatCompactNumber,
  type StudioOverviewDTO,
  type TimeSeriesPointDTO,
} from '@kelvyntube/shared';
import { EmptyState, Skeleton, StatCard, Tabs, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { Panel } from './Panel';
import { RangeSelect } from './RangeSelect';
import { StudioThumbnail } from './bits';
import { HourlyBars, MetricAreaChart } from './charts';
import { useChartTheme } from './charts/chart-theme';
import { parsePreset, presetLabel, studioKeys, type StudioRealtimeDTO } from './studio-api';
import { useChannelId, useStudioUrlState } from './useStudioUrlState';
import {
  formatClock,
  formatCurrency,
  formatHours,
  formatNumber,
  formatRatioAsPercent,
} from './studio-format';

type MetricKey = 'views' | 'watchTime' | 'subscribers' | 'revenue';

const METRICS: {
  key: MetricKey;
  label: string;
  seriesOf: (o: StudioOverviewDTO) => TimeSeriesPointDTO[];
  format: (v: number) => string;
}[] = [
  { key: 'views', label: 'Vues', seriesOf: (o) => o.series.views, format: formatNumber },
  {
    key: 'watchTime',
    label: 'Temps de visionnage',
    seriesOf: (o) => o.series.watchTime,
    format: formatHours,
  },
  {
    key: 'subscribers',
    label: 'Abonnés',
    seriesOf: (o) => o.series.subscribers,
    format: formatNumber,
  },
  { key: 'revenue', label: 'Revenus estimés', seriesOf: (o) => o.series.revenue, format: formatCurrency },
];

/**
 * `/studio/[channelId]/analytics`
 * Analytics de chaîne : évolution des métriques, audience en direct et
 * classement du contenu sur la période choisie.
 */
export function AnalyticsScreen() {
  const channelId = useChannelId();
  const { get } = useStudioUrlState();
  const preset = parsePreset(get('preset'));
  const theme = useChartTheme();

  const [tab, setTab] = useState('overview');
  const [metric, setMetric] = useState<MetricKey>('views');

  const overview = useQuery({
    queryKey: studioKeys.overview(channelId, preset),
    queryFn: () =>
      api.get<StudioOverviewDTO>(ROUTES.studio.overview(channelId), { query: { preset } }),
    enabled: Boolean(channelId),
  });

  const realtime = useQuery({
    queryKey: studioKeys.realtime(channelId),
    queryFn: () => api.get<StudioRealtimeDTO>(ROUTES.studio.realtime(channelId)),
    enabled: Boolean(channelId),
    refetchInterval: 30_000,
  });

  const data = overview.data;
  const activeMetric = useMemo(
    () => METRICS.find((m) => m.key === metric) ?? METRICS[0],
    [metric],
  );

  if (overview.isLoading) return <AnalyticsSkeleton />;

  if (overview.isError || !data) {
    return (
      <EmptyState
        icon={<BarChart3 size={40} />}
        title="Statistiques indisponibles"
        description="Impossible de charger les analytics de cette chaîne pour le moment."
        action={
          <button type="button" className="kt-btn-secondary" onClick={() => void overview.refetch()}>
            Réessayer
          </button>
        }
      />
    );
  }

  const { totals } = data;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-kt-xl font-semibold">Analytics de la chaîne</h1>
          <p className="text-kt-sm text-fg-muted">{presetLabel(preset)}</p>
        </div>
        <RangeSelect value={preset} />
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        panelIdPrefix="studio-analytics"
        items={[
          { id: 'overview', label: "Vue d'ensemble" },
          { id: 'content', label: 'Contenu' },
          { id: 'audience', label: 'Audience' },
        ]}
      />

      {/* ── Vue d'ensemble ────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <section
          id="studio-analytics-overview"
          role="tabpanel"
          aria-labelledby="studio-analytics-tab-overview"
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3 feed-3:grid-cols-4">
            <StatCard
              icon={<Eye size={18} />}
              label="Vues"
              value={formatCompactNumber(totals.views)}
              sparkline={data.series.views.map((p) => p.value)}
            />
            <StatCard
              icon={<Clock3 size={18} />}
              label="Temps de visionnage"
              value={formatHours(totals.watchTimeHours)}
              sparkline={data.series.watchTime.map((p) => p.value)}
            />
            <StatCard
              icon={<Users size={18} />}
              label="Abonnés"
              value={formatCompactNumber(totals.subscribers)}
              delta={totals.subscribersDelta}
              sparkline={data.series.subscribers.map((p) => p.value)}
            />
            <StatCard
              icon={<Euro size={18} />}
              label="Revenus estimés"
              value={formatCurrency(totals.estimatedRevenue)}
              hint="Estimation — la monétisation réelle n'est pas activée"
              sparkline={data.series.revenue.map((p) => p.value)}
            />
          </div>

          <Panel
            title={activeMetric.label}
            actions={
              <div className="flex flex-wrap gap-1.5">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetric(m.key)}
                    aria-pressed={m.key === metric}
                    className={cn('kt-chip', m.key === metric && 'kt-chip-active')}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            }
            bodyClassName="p-2 feed-3:p-4"
          >
            <MetricAreaChart
              points={activeMetric.seriesOf(data)}
              seriesName={activeMetric.label}
              formatValue={activeMetric.format}
              color={theme.accent}
              height={320}
            />
          </Panel>

          <div className="grid grid-cols-2 gap-3 feed-3:grid-cols-3">
            <StatCard
              icon={<MousePointerClick size={18} />}
              label="Taux de clic (miniatures)"
              value={formatRatioAsPercent(totals.ctr)}
              hint={`${formatNumber(totals.impressions)} impressions`}
            />
            <StatCard
              icon={<Activity size={18} />}
              label="Durée moyenne de visionnage"
              value={formatClock(totals.avgViewDurationSec)}
            />
            <StatCard
              icon={<Radio size={18} />}
              label="Spectateurs en direct"
              value={formatNumber(realtime.data?.liveViewers ?? data.realtime.liveViewers)}
            />
          </div>
        </section>
      )}

      {/* ── Contenu ───────────────────────────────────────────────────── */}
      {tab === 'content' && (
        <section
          id="studio-analytics-content"
          role="tabpanel"
          aria-labelledby="studio-analytics-tab-content"
        >
          <Panel
            title="Vos meilleures vidéos"
            description={`Classement sur la période — ${presetLabel(preset)}`}
            bodyClassName="p-0"
          >
            {data.topVideos.length === 0 ? (
              <EmptyState
                title="Aucune donnée sur cette période"
                description="Publiez une vidéo ou élargissez la période pour voir apparaître des statistiques."
                size="sm"
              />
            ) : (
              <table className="w-full text-kt-base">
                <thead>
                  <tr className="border-b border-border text-left text-kt-sm text-fg-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Vidéo
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Vues
                    </th>
                    <th scope="col" className="hidden px-4 py-2 text-right font-medium feed-2:table-cell">
                      Temps de visionnage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topVideos.map((v, index) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-5 shrink-0 text-right text-kt-sm text-fg-subtle">
                            {index + 1}
                          </span>
                          <StudioThumbnail url={v.thumbnailUrl} className="h-[45px] w-20" />
                          <Link
                            href={PATHS.studioVideo(channelId, v.id)}
                            className="kt-clamp-2 min-w-0 hover:underline"
                          >
                            {v.title}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatNumber(v.views)}</td>
                      <td className="hidden px-4 py-3 text-right tabular-nums feed-2:table-cell">
                        {formatHours(v.watchTimeHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </section>
      )}

      {/* ── Audience ──────────────────────────────────────────────────── */}
      {tab === 'audience' && (
        <section
          id="studio-analytics-audience"
          role="tabpanel"
          aria-labelledby="studio-analytics-tab-audience"
          className="flex flex-col gap-4"
        >
          <Panel
            title="En temps réel"
            description="Actualisé toutes les 30 secondes"
            actions={
              <span className="flex items-center gap-1.5 text-kt-sm text-fg-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden="true" />
                En direct
              </span>
            }
          >
            <div className="mb-4 flex flex-wrap gap-6">
              <div>
                <p className="text-kt-sm text-fg-muted">Spectateurs en ce moment</p>
                <p className="text-[32px] font-semibold leading-tight tabular-nums">
                  {formatNumber(realtime.data?.liveViewers ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-kt-sm text-fg-muted">Vues sur 48 h</p>
                <p className="text-[32px] font-semibold leading-tight tabular-nums">
                  {formatNumber(realtime.data?.last48hViews ?? data.realtime.last48hViews)}
                </p>
              </div>
            </div>
            <HourlyBars
              points={realtime.data?.perHour ?? data.realtime.perHour}
              seriesName="Vues"
              height={140}
            />
          </Panel>

          <Panel title="Vidéos regardées en ce moment" bodyClassName="p-0">
            {(realtime.data?.topVideosNow ?? []).length === 0 ? (
              <EmptyState
                title="Personne ne regarde actuellement"
                description="Les spectateurs actifs apparaîtront ici en direct."
                size="sm"
              />
            ) : (
              <ul>
                {realtime.data?.topVideosNow.map(({ video, viewers }) => (
                  <li
                    key={video.id}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    <StudioThumbnail url={video.thumbnailUrl} className="h-[45px] w-20" />
                    <Link
                      href={PATHS.studioVideo(channelId, video.id)}
                      className="kt-clamp-2 min-w-0 flex-1 hover:underline"
                    >
                      {video.title}
                    </Link>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {formatNumber(viewers)} spectateur{viewers > 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Répartition détaillée"
            description="Sources de trafic, appareils, pays et âge sont disponibles vidéo par vidéo."
          >
            <p className="text-kt-base text-fg-muted">
              Ouvrez une vidéo depuis l'onglet{' '}
              <Link href={PATHS.studioVideos(channelId)} className="text-accent-fg hover:underline">
                Contenu
              </Link>{' '}
              puis son onglet Analytics pour consulter sa courbe de rétention et ses répartitions
              démographiques.
            </p>
          </Panel>
        </section>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton variant="rect" className="h-9 w-64 rounded-kt" />
      <div className="grid grid-cols-2 gap-3 feed-3:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rect" className="h-28 w-full rounded-kt" />
        ))}
      </div>
      <Skeleton variant="rect" className="h-[380px] w-full rounded-kt" />
    </div>
  );
}
