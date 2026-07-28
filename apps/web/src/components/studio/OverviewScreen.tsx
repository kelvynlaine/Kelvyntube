'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Clock3,
  Eye,
  Euro,
  MousePointerClick,
  Radio,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  ROUTES,
  formatCompactNumber,
  formatDuration,
  formatRelativeTime,
  type OffsetPage,
  type StudioOverviewDTO,
  type StudioVideoRowDTO,
  type TimeSeriesPointDTO,
} from '@kelvyntube/shared';
import { Badge, Chip, EmptyState, Skeleton, StatCard, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { Panel } from './Panel';
import { RangeSelect } from './RangeSelect';
import { VideoProcessingStatus } from './VideoProcessingStatus';
import { HourlyBars, MetricAreaChart } from './charts';
import { useChartTheme } from './charts/chart-theme';
import {
  VISIBILITY_LABELS,
  parsePreset,
  presetComparisonLabel,
  studioKeys,
  type StudioRealtimeDTO,
} from './studio-api';
import {
  formatClock,
  formatCurrency,
  formatHours,
  formatNumber,
  formatRatioAsPercent,
  formatShortDate,
} from './studio-format';
import { useChannelId, useStudioUrlState } from './useStudioUrlState';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  VUE D'ENSEMBLE DU STUDIO
 *  Rangée de métriques, grand graphique commutable, bloc temps réel,
 *  top vidéos de la période et dernières mises en ligne.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type MetricKey = 'views' | 'watchTime' | 'subscribers' | 'revenue';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'views', label: 'Vues' },
  { key: 'watchTime', label: 'Temps de visionnage' },
  { key: 'subscribers', label: 'Abonnés' },
  { key: 'revenue', label: 'Revenus' },
];

const METRIC_VALUE_FORMATTERS: Record<MetricKey, (value: number) => string> = {
  views: formatNumber,
  watchTime: formatHours,
  subscribers: formatNumber,
  revenue: formatCurrency,
};

function parseMetric(raw: string | null): MetricKey {
  return METRICS.some((metric) => metric.key === raw) ? (raw as MetricKey) : 'views';
}

const values = (series: TimeSeriesPointDTO[]) => series.map((point) => point.value);

export function OverviewScreen() {
  const channelId = useChannelId();
  const { get, setQuery } = useStudioUrlState();
  const preset = parsePreset(get('preset'));
  const metric = parseMetric(get('metric'));
  const theme = useChartTheme();

  const overviewQuery = useQuery({
    queryKey: studioKeys.overview(channelId, preset),
    queryFn: () =>
      api.get<StudioOverviewDTO>(ROUTES.studio.overview(channelId), { query: { preset } }),
    enabled: Boolean(channelId),
  });

  // Bloc temps réel : rafraîchi toutes les 30 s, même onglet en arrière-plan.
  const realtimeQuery = useQuery({
    queryKey: studioKeys.realtime(channelId),
    queryFn: () => api.get<StudioRealtimeDTO>(ROUTES.studio.realtime(channelId)),
    enabled: Boolean(channelId),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // Dernières mises en ligne, tous statuts confondus (suivi du traitement).
  const latestQuery = useQuery({
    queryKey: studioKeys.videos(channelId, { scope: 'latest' }),
    queryFn: () =>
      api.get<OffsetPage<StudioVideoRowDTO>>(ROUTES.studio.videos(channelId), {
        query: { page: 1, pageSize: 5, sort: 'recent' },
      }),
    enabled: Boolean(channelId),
  });

  const overview = overviewQuery.data;

  const chartPoints = useMemo(() => {
    if (!overview) return [];
    return overview.series[metric];
  }, [overview, metric]);

  const metricColor =
    metric === 'revenue'
      ? theme.success
      : metric === 'subscribers'
        ? theme.brand
        : theme.accent;

  // Croissance relative des abonnés sur la période (le DTO fournit le solde absolu).
  const subscriberDeltaPct = useMemo(() => {
    if (!overview) return null;
    const { subscribers, subscribersDelta } = overview.totals;
    const base = subscribers - subscribersDelta;
    if (base <= 0) return null;
    return (subscribersDelta / base) * 100;
  }, [overview]);

  const realtime = realtimeQuery.data ?? overview?.realtime ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── En-tête de période ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-kt-lg font-medium text-fg">Vue d&apos;ensemble</h2>
          {overview ? (
            <p className="text-kt-sm text-fg-muted">
              Du {formatShortDate(overview.range.from)} au {formatShortDate(overview.range.to)}
            </p>
          ) : null}
        </div>
        <RangeSelect value={preset} />
      </div>

      {/* ── Rangée de métriques ────────────────────────────────────────── */}
      {overviewQuery.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} variant="rect" className="h-36 w-full rounded-kt" />
          ))}
        </div>
      ) : overviewQuery.isError || !overview ? (
        <EmptyState
          icon={<Activity size={36} aria-hidden="true" />}
          title="Statistiques indisponibles"
          description="Impossible de charger les analytics de la chaîne pour le moment. Réessayez dans un instant."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Vues"
              value={formatNumber(overview.totals.views)}
              icon={<Eye size={16} />}
              sparkline={values(overview.series.views)}
            />
            <StatCard
              label="Temps de visionnage (heures)"
              value={formatHours(overview.totals.watchTimeHours)}
              icon={<Clock3 size={16} />}
              sparkline={values(overview.series.watchTime)}
            />
            <StatCard
              label="Abonnés"
              value={formatNumber(overview.totals.subscribers)}
              delta={subscriberDeltaPct}
              deltaLabel={presetComparisonLabel(preset)}
              hint={`${overview.totals.subscribersDelta >= 0 ? '+' : ''}${formatNumber(
                overview.totals.subscribersDelta,
              )} sur la période`}
              icon={<Users size={16} />}
              sparkline={values(overview.series.subscribers)}
            />
            <StatCard
              label="Revenus estimés"
              value={formatCurrency(overview.totals.estimatedRevenue)}
              icon={<Euro size={16} />}
              sparkline={values(overview.series.revenue)}
            />
            {/*
              Impressions, CTR et durée moyenne n'ont pas de série journalière
              dans `StudioOverviewDTO` : on affiche donc un repère textuel
              plutôt qu'une sparkline inventée.
            */}
            <StatCard
              label="Impressions"
              value={formatNumber(overview.totals.impressions)}
              hint="Miniatures affichées aux spectateurs"
              icon={<Eye size={16} />}
            />
            <StatCard
              label="Taux de clic (CTR)"
              value={formatRatioAsPercent(overview.totals.ctr)}
              hint="Clics sur la miniature / impressions"
              icon={<MousePointerClick size={16} />}
            />
            <StatCard
              label="Durée moyenne de visionnage"
              value={formatClock(overview.totals.avgViewDurationSec)}
              hint="Par vue, sur la période"
              icon={<Clock3 size={16} />}
            />
          </div>

          {/* ── Grand graphique ─────────────────────────────────────────── */}
          <Panel
            title="Évolution"
            actions={
              <div role="group" aria-label="Métrique affichée" className="flex flex-wrap gap-2">
                {METRICS.map((item) => (
                  <Chip
                    key={item.key}
                    active={item.key === metric}
                    aria-pressed={item.key === metric}
                    onClick={() => setQuery({ metric: item.key })}
                  >
                    {item.label}
                  </Chip>
                ))}
              </div>
            }
          >
            {chartPoints.length > 1 ? (
              <MetricAreaChart
                points={chartPoints}
                color={metricColor}
                seriesName={METRICS.find((item) => item.key === metric)?.label ?? 'Vues'}
                formatValue={METRIC_VALUE_FORMATTERS[metric]}
              />
            ) : (
              <p className="py-12 text-center text-kt-base text-fg-muted">
                Pas encore assez de données pour tracer une courbe sur cette période.
              </p>
            )}
          </Panel>
        </>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        {/* ── Top vidéos de la période ─────────────────────────────────── */}
        <Panel
          title="Top vidéos de la période"
          description="Classées par nombre de vues."
          bodyClassName="p-0"
        >
          {overviewQuery.isPending ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} variant="rect" className="h-14 w-full rounded-kt" />
              ))}
            </div>
          ) : !overview || overview.topVideos.length === 0 ? (
            <p className="p-6 text-center text-kt-base text-fg-muted">
              Aucune vue enregistrée sur cette période.
            </p>
          ) : (
            <div className="kt-scroll overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-kt-base">
                <caption className="sr-only">
                  Vidéos les plus vues de la période, avec leur temps de visionnage
                </caption>
                <thead>
                  <tr className="border-b border-border text-left text-kt-sm text-fg-muted">
                    <th scope="col" className="px-4 py-2 font-medium">
                      Vidéo
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Vues
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      Heures de visionnage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.topVideos.map((video) => (
                    <tr key={video.id} className="border-b border-border last:border-0">
                      <th scope="row" className="max-w-0 px-4 py-2 text-left font-normal">
                        <Link
                          href={`${PATHS.studioVideo(channelId, video.id)}?tab=analytics`}
                          className="flex items-center gap-3 rounded-kt kt-focus-ring"
                        >
                          <span className="relative block h-9 w-16 shrink-0 overflow-hidden rounded bg-bg-hover">
                            {video.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={video.thumbnailUrl}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="kt-clamp-1 text-fg">{video.title}</span>
                            <span className="block text-kt-sm text-fg-subtle">
                              {formatDuration(video.durationSec)}
                            </span>
                          </span>
                        </Link>
                      </th>
                      <td className="px-4 py-2 text-right tabular-nums text-fg">
                        {formatNumber(video.views)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-fg-muted">
                        {formatHours(video.watchTimeHours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {/* ── En temps réel ──────────────────────────────────────────── */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Radio size={16} aria-hidden="true" className="text-brand" />
                En temps réel
              </span>
            }
            description="Mise à jour toutes les 30 secondes."
          >
            {realtime ? (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[40px] font-medium leading-none tabular-nums text-fg">
                    {formatNumber(realtime.liveViewers)}
                  </p>
                  <p className="mt-1 text-kt-sm text-fg-muted">
                    spectateur{realtime.liveViewers > 1 ? 's' : ''} en direct
                  </p>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-kt-lg font-medium tabular-nums text-fg">
                    {formatCompactNumber(realtime.last48hViews)}
                  </p>
                  <p className="text-kt-sm text-fg-muted">vues sur 48 heures</p>
                  <div className="mt-2">
                    <HourlyBars points={realtime.perHour} />
                  </div>
                </div>

                {realtimeQuery.data && realtimeQuery.data.topVideosNow.length > 0 ? (
                  <ul className="flex flex-col gap-2 border-t border-border pt-3">
                    {realtimeQuery.data.topVideosNow.map((entry) => (
                      <li key={entry.video.id} className="flex items-center gap-2 text-kt-sm">
                        <Link
                          href={`${PATHS.studioVideo(channelId, entry.video.id)}?tab=analytics`}
                          className="kt-clamp-1 min-w-0 flex-1 text-fg hover:underline kt-focus-ring"
                        >
                          {entry.video.title}
                        </Link>
                        <span className="shrink-0 tabular-nums text-fg-muted">
                          {formatNumber(entry.viewers)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <Skeleton variant="rect" className="h-40 w-full rounded-kt" />
            )}
          </Panel>

          {/* ── Vos dernières vidéos ───────────────────────────────────── */}
          <Panel
            title="Vos dernières vidéos"
            actions={
              <Link
                href={PATHS.studioVideos(channelId)}
                className="text-kt-sm font-medium text-accent-fg hover:underline kt-focus-ring"
              >
                Tout voir
              </Link>
            }
            bodyClassName="p-0"
          >
            {latestQuery.isPending ? (
              <div className="flex flex-col gap-3 p-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} variant="rect" className="h-14 w-full rounded-kt" />
                ))}
              </div>
            ) : !latestQuery.data || latestQuery.data.items.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  size="sm"
                  icon={<TrendingUp size={28} aria-hidden="true" />}
                  title="Aucune vidéo"
                  description="Mettez en ligne votre première vidéo pour voir vos statistiques ici."
                  action={
                    <Link
                      href={PATHS.studioUpload(channelId)}
                      className={cn(
                        'inline-flex h-9 items-center rounded-pill bg-brand px-4',
                        'text-kt-base font-medium text-white hover:bg-brand-hover kt-focus-ring',
                      )}
                    >
                      Mettre en ligne
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="flex flex-col">
                {latestQuery.data.items.map((video) => (
                  <li key={video.id} className="border-b border-border last:border-0">
                    <div className="flex items-start gap-3 p-3">
                      <Link
                        href={PATHS.studioVideo(channelId, video.id)}
                        className="relative block h-9 w-16 shrink-0 overflow-hidden rounded bg-bg-hover kt-focus-ring"
                        aria-label={`Modifier « ${video.title} »`}
                      >
                        {video.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={video.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : null}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={PATHS.studioVideo(channelId, video.id)}
                          className="kt-clamp-1 text-kt-base text-fg hover:underline kt-focus-ring"
                        >
                          {video.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-kt-sm text-fg-subtle">
                          <Badge>{VISIBILITY_LABELS[video.visibility]}</Badge>
                          <span>
                            {video.publishedAt
                              ? formatRelativeTime(video.publishedAt)
                              : formatRelativeTime(video.createdAt)}
                          </span>
                        </p>
                        <div className="mt-1.5">
                          <VideoProcessingStatus
                            videoId={video.id}
                            status={video.status}
                            progress={video.processingProgress}
                            error={video.processingError}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
