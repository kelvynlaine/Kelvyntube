'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { ROUTES, formatCompactNumber } from '@kelvyntube/shared';
import { EmptyState, Skeleton, StatCard } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { Panel } from './Panel';
import { RangeSelect } from './RangeSelect';
import { StudioThumbnail } from './bits';
import { MetricAreaChart } from './charts';
import { useChartTheme } from './charts/chart-theme';
import { parsePreset, presetLabel, studioKeys, type StudioSubscribersDTO } from './studio-api';
import { useChannelId, useStudioUrlState } from './useStudioUrlState';
import { formatNumber } from './studio-format';

/**
 * `/studio/[channelId]/abonnes`
 * Évolution des abonnés et contribution de chaque vidéo au solde net.
 */
export function SubscribersScreen() {
  const channelId = useChannelId();
  const { get } = useStudioUrlState();
  const preset = parsePreset(get('preset'));
  const theme = useChartTheme();

  const query = useQuery({
    queryKey: studioKeys.subscribers(channelId, preset),
    queryFn: () =>
      api.get<StudioSubscribersDTO>(ROUTES.studio.subscribers(channelId), { query: { preset } }),
    enabled: Boolean(channelId),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" className="h-9 w-56 rounded-kt" />
        <div className="grid grid-cols-1 gap-3 feed-2:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-28 w-full rounded-kt" />
          ))}
        </div>
        <Skeleton variant="rect" className="h-[320px] w-full rounded-kt" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        icon={<Users size={40} />}
        title="Statistiques d'abonnés indisponibles"
        description="Impossible de charger ces données pour le moment."
        action={
          <button type="button" className="kt-btn-secondary min-h-11" onClick={() => void query.refetch()}>
            Réessayer
          </button>
        }
      />
    );
  }

  const { total, gained, lost, series, byVideo } = query.data;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-kt-xl font-semibold">Abonnés</h1>
          <p className="text-kt-sm text-fg-muted">{presetLabel(preset)}</p>
        </div>
        <RangeSelect value={preset} />
      </header>

      <div className="grid grid-cols-1 gap-3 feed-2:grid-cols-3">
        <StatCard icon={<Users size={18} />} label="Total d'abonnés" value={formatCompactNumber(total)} />
        <StatCard
          icon={<UserPlus size={18} />}
          label="Gagnés sur la période"
          value={`+${formatNumber(gained)}`}
        />
        <StatCard
          icon={<UserMinus size={18} />}
          label="Perdus sur la période"
          value={`−${formatNumber(lost)}`}
          invertDelta
        />
      </div>

      <Panel
        title="Solde net par jour"
        description="Abonnés gagnés moins abonnés perdus, jour par jour."
        bodyClassName="p-2 feed-3:p-4"
      >
        <MetricAreaChart
          points={series}
          seriesName="Solde net"
          formatValue={(v) => (v >= 0 ? `+${formatNumber(v)}` : `−${formatNumber(Math.abs(v))}`)}
          color={theme.success}
          height={280}
          mobileHeight={200}
        />
      </Panel>

      <Panel
        title="Abonnés gagnés par vidéo"
        description="Quelles vidéos convertissent le mieux vos spectateurs."
        bodyClassName="p-0"
      >
        {byVideo.length === 0 ? (
          <EmptyState
            title="Aucun mouvement d'abonnés"
            description="Publiez du contenu ou élargissez la période pour voir apparaître ces données."
            size="sm"
          />
        ) : (
          /*
            Quatre colonnes numériques ne tiennent pas sur 320 px : « Gagnés »
            et « Perdus » ne s'affichent qu'à partir de feed-2, le solde net
            (la seule colonne indispensable) restant toujours visible.
            `table-fixed` empêche le tableau de forcer la largeur du panneau.
          */
          <table className="w-full table-fixed text-kt-base">
            <thead>
              <tr className="border-b border-border text-left text-kt-sm text-fg-muted">
                <th scope="col" className="px-3 py-2 font-medium feed-2:px-4">
                  Vidéo
                </th>
                <th
                  scope="col"
                  className="hidden w-24 px-4 py-2 text-right font-medium feed-2:table-cell"
                >
                  Gagnés
                </th>
                <th
                  scope="col"
                  className="hidden w-24 px-4 py-2 text-right font-medium feed-2:table-cell"
                >
                  Perdus
                </th>
                <th scope="col" className="w-20 px-3 py-2 text-right font-medium feed-2:px-4">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {byVideo.map(({ video, gained: g, lost: l }) => {
                const net = g - l;
                return (
                  <tr key={video.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 feed-2:px-4">
                      <div className="flex items-center gap-2 feed-2:gap-3">
                        <StudioThumbnail
                          url={video.thumbnailUrl}
                          className="h-[45px] w-20 shrink-0"
                        />
                        <Link
                          href={PATHS.studioVideo(channelId, video.id)}
                          className="kt-clamp-2 min-w-0 hover:underline"
                        >
                          {video.title}
                        </Link>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-success feed-2:table-cell">
                      +{formatNumber(g)}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums text-fg-muted feed-2:table-cell">
                      −{formatNumber(l)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums feed-2:px-4 ${
                        net >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {net >= 0 ? '+' : '−'}
                      {formatNumber(Math.abs(net))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
