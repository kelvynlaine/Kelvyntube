'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Clock3,
  Eye,
  MessageSquare,
  Rocket,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
  Video,
} from 'lucide-react';
import {
  BOOST_LIMITS,
  ROUTES,
  boostSchema,
  formatCompactNumber,
  type BoostInput,
  type BoostResultDTO,
  type OffsetPage,
  type StudioVideoRowDTO,
} from '@kelvyntube/shared';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  ProgressBar,
  Select,
  Skeleton,
  StatCard,
  cn,
  useToast,
} from '@kelvyntube/ui';
import { ApiClientError, api } from '@/lib/api';
import { BoostMetricField, clampMetric } from './BoostMetricField';
import { Panel } from './Panel';
import { StudioThumbnail } from './bits';
import { studioKeys } from './studio-api';
import { formatNumber } from './studio-format';
import { useChannelId } from './useStudioUrlState';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BOOSTER D'ENGAGEMENT — `/studio/[channelId]/booster`
 *
 *  Outil de développement / démonstration : il fabrique des métriques
 *  SIMULÉES sur l'instance locale (compteurs, agrégats journaliers, comptes
 *  robots) afin de peupler le tableau de bord et d'éprouver l'algorithme de
 *  recommandation. Ce n'est pas de l'audience réelle.
 *
 *  L'écran est un formulaire : cible → métriques → étalement → confirmation.
 *  La validation client rejoue `boostSchema` avant l'envoi pour afficher les
 *  erreurs champ par champ sans aller-retour réseau.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type TargetMode = 'channel' | 'video';

/** Les cinq compteurs pilotés par le formulaire. */
interface MetricState {
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  subscribers: number;
}

const EMPTY_METRICS: MetricState = {
  views: 0,
  likes: 0,
  dislikes: 0,
  comments: 0,
  subscribers: 0,
};

interface MetricConfig {
  key: keyof MetricState;
  label: string;
  icon: ReactNode;
  max: number;
  shortcuts: number[];
  hint?: ReactNode;
}

/** Les raccourcis sont calés sur l'ordre de grandeur du plafond de la métrique. */
const METRICS: MetricConfig[] = [
  {
    key: 'views',
    label: 'Vues',
    icon: <Eye size={18} aria-hidden="true" />,
    max: BOOST_LIMITS.views,
    shortcuts: [1_000, 100_000, 1_000_000, 1_000_000_000],
    hint: 'Compteurs et agrégats journaliers uniquement : aucune session de lecture n’est créée.',
  },
  {
    key: 'likes',
    label: "J'aime",
    icon: <ThumbsUp size={18} aria-hidden="true" />,
    max: BOOST_LIMITS.likes,
    shortcuts: [1_000, 100_000, 1_000_000, 100_000_000],
  },
  {
    key: 'dislikes',
    label: "Je n'aime pas",
    icon: <ThumbsDown size={18} aria-hidden="true" />,
    max: BOOST_LIMITS.dislikes,
    shortcuts: [1_000, 100_000, 1_000_000, 10_000_000],
  },
  {
    key: 'comments',
    label: 'Commentaires',
    icon: <MessageSquare size={18} aria-hidden="true" />,
    max: BOOST_LIMITS.comments,
    shortcuts: [10, 100, 500, 1_000],
    hint: (
      <>
        Contrairement aux vues, chaque commentaire est une vraie ligne écrite par un compte robot,
        visible sous la vidéo et supprimable à la main. Plafond&nbsp;:{' '}
        {formatNumber(BOOST_LIMITS.comments)}.
      </>
    ),
  },
  {
    key: 'subscribers',
    label: 'Abonnés',
    icon: <UserPlus size={18} aria-hidden="true" />,
    max: BOOST_LIMITS.subscribers,
    shortcuts: [1_000, 100_000, 1_000_000, 100_000_000],
  },
];

const SPREAD_PRESETS = [7, 30, 90, 365];

export function BoostScreen() {
  const channelId = useChannelId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [targetMode, setTargetMode] = useState<TargetMode>('channel');
  const [videoId, setVideoId] = useState<string>('');
  const [metrics, setMetrics] = useState<MetricState>(EMPTY_METRICS);
  const [spreadDays, setSpreadDays] = useState<number>(30);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BoostResultDTO | null>(null);

  // ── Vidéos ciblables ───────────────────────────────────────────────────
  const videosQuery = useQuery({
    queryKey: studioKeys.videos(channelId, { scope: 'boost', pageSize: 100 }),
    queryFn: () =>
      api.get<OffsetPage<StudioVideoRowDTO>>(ROUTES.studio.videos(channelId), {
        query: { page: 1, pageSize: 100, sort: 'recent' },
      }),
    enabled: Boolean(channelId),
  });

  // Seules les vidéos prêtes ont des compteurs et des agrégats à gonfler.
  const readyVideos = useMemo(
    () => (videosQuery.data?.items ?? []).filter((video) => video.status === 'READY'),
    [videosQuery.data],
  );

  const selectedVideo = readyVideos.find((video) => video.id === videoId) ?? null;
  const commentsEnabled = targetMode === 'video' && Boolean(videoId);

  const setMetric = useCallback((key: keyof MetricState, value: number) => {
    setMetrics((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  /** Changer de cible : la chaîne entière interdit les commentaires. */
  const handleTargetMode = useCallback((mode: TargetMode) => {
    setTargetMode(mode);
    setErrors({});
    if (mode === 'channel') {
      setVideoId('');
      setMetrics((current) => ({ ...current, comments: 0 }));
    }
  }, []);

  const handleVideoSelect = useCallback((id: string) => {
    setVideoId(id);
    setErrors((current) => {
      const { videoId: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const total =
    metrics.views + metrics.likes + metrics.dislikes + metrics.comments + metrics.subscribers;

  /** Charge utile envoyée à l'API — `videoId` absent = toute la chaîne. */
  const payload: BoostInput = useMemo(
    () => ({
      ...metrics,
      spreadDays,
      ...(targetMode === 'video' && videoId ? { videoId } : {}),
    }),
    [metrics, spreadDays, targetMode, videoId],
  );

  // ── Envoi ──────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (input: BoostInput) =>
      api.post<BoostResultDTO>(ROUTES.studio.boost(channelId), input),
    onSuccess: async (data) => {
      setResult(data);
      setServerError(null);
      setConfirmOpen(false);
      toast({ message: 'Simulation appliquée. Le tableau de bord est à jour.', variant: 'success' });

      // Les clés du Studio sont préfixées (`['studio', <section>, <id>, …]`) :
      // on invalide par préfixe pour toucher toutes les périodes et tous les
      // filtres déjà en cache.
      const overviewPrefix = studioKeys.overview(channelId, '28d').slice(0, 3);
      const videosPrefix = studioKeys.videos(channelId, {}).slice(0, 3);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: overviewPrefix }),
        queryClient.invalidateQueries({ queryKey: videosPrefix }),
        ...(data.target.type === 'video'
          ? [queryClient.invalidateQueries({ queryKey: studioKeys.video(data.target.id) })]
          : []),
      ]);
    },
    onError: (error: Error) => {
      setServerError(error.message);
      if (error instanceof ApiClientError && error.details) {
        const details = error.details;
        setErrors(
          Object.fromEntries(
            Object.entries(details)
              .map(([field, messages]) => [field, messages[0]])
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
          ),
        );
      }
      toast({ message: error.message, variant: 'error' });
    },
  });

  /** Rejoue `boostSchema` côté client avant d'ouvrir la confirmation. */
  const handleSubmit = useCallback(() => {
    setServerError(null);

    if (targetMode === 'video' && !videoId) {
      setErrors({ videoId: 'Choisis la vidéo à booster.' });
      return;
    }

    const parsed = boostSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    setConfirmOpen(true);
  }, [payload, targetMode, videoId]);

  const nonZeroMetrics = METRICS.filter((metric) => metrics[metric.key] > 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-kt-xl font-semibold text-fg">
            <Rocket size={22} aria-hidden="true" />
            Booster d’engagement
          </h1>
          <p className="text-kt-sm text-fg-muted">
            Génère des statistiques de test sur ta propre instance.
          </p>
        </div>
      </header>

      {/* ── Avertissement : données simulées ──────────────────────────── */}
      <div className="flex items-start gap-3 rounded-kt border border-warning/40 bg-warning/10 p-4">
        <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col gap-1">
          <Badge className="w-fit bg-warning/20 text-warning">Outil de développement</Badge>
          <p className="text-kt-sm text-fg-muted">
            Les métriques produites ici sont <strong className="text-fg">simulées et locales</strong>{' '}
            : elles servent à peupler le tableau de bord et à tester l’algorithme de recommandation
            de cette instance, et ne représentent aucune audience réelle.
          </p>
        </div>
      </div>

      {/*
        Le récapitulatif n'est collant qu'à partir de `lg`, où il occupe sa
        propre colonne. En mobile il se contente de suivre le formulaire :
        une carte collante y masquerait en permanence le bas du contenu.
      */}
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── Cible ───────────────────────────────────────────────── */}
          <Panel
            title="Cible de la simulation"
            description="Toute la chaîne, ou une vidéo précise."
            bodyClassName="flex flex-col gap-4 p-3 feed-2:p-4"
          >
            <Select
              label="Portée"
              value={targetMode}
              className="h-11 feed-3:h-10"
              onChange={(event) => handleTargetMode(event.target.value as TargetMode)}
              options={[
                { value: 'channel', label: 'Toute la chaîne' },
                { value: 'video', label: 'Une vidéo précise' },
              ]}
              hint={
                targetMode === 'channel'
                  ? 'Les vues, réactions et abonnés sont répartis sur l’ensemble des vidéos prêtes.'
                  : 'Toutes les métriques sont appliquées à la vidéo sélectionnée.'
              }
            />

            {targetMode === 'video' ? (
              videosQuery.isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} variant="rect" className="h-14 w-full rounded-kt" />
                  ))}
                </div>
              ) : readyVideos.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Video size={28} />}
                  title="Aucune vidéo prête"
                  description="Le booster ne cible que les vidéos dont le traitement est terminé."
                />
              ) : (
                <fieldset className="flex min-w-0 flex-col gap-1.5">
                  <legend className="mb-1.5 text-kt-sm font-medium text-fg-muted">
                    Vidéo ciblée
                  </legend>
                  <div className="kt-scroll flex max-h-80 flex-col gap-1 overflow-y-auto pr-1">
                    {readyVideos.map((video) => {
                      const active = video.id === videoId;
                      return (
                        <label
                          key={video.id}
                          className={cn(
                            // `min-h-14` : la ligne entière est la cible tactile,
                            // le bouton radio natif ne fait que 16 px.
                            'flex min-h-14 cursor-pointer items-center gap-3 rounded-kt border p-2 transition-colors',
                            active
                              ? 'border-border-strong bg-bg-hover'
                              : 'border-transparent hover:bg-bg-hover',
                          )}
                        >
                          <input
                            type="radio"
                            name="boost-target-video"
                            value={video.id}
                            checked={active}
                            onChange={() => handleVideoSelect(video.id)}
                            className="size-4 shrink-0 accent-brand kt-focus-ring"
                          />
                          <StudioThumbnail
                            url={video.thumbnailUrl}
                            alt=""
                            className="h-10 w-[72px]"
                          />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-kt-base text-fg">{video.title}</span>
                            <span className="text-kt-sm tabular-nums text-fg-muted">
                              {formatNumber(video.viewCount)} vues ·{' '}
                              {formatNumber(video.likeCount)} j’aime
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.videoId ? (
                    <p role="alert" className="text-kt-sm text-danger">
                      {errors.videoId}
                    </p>
                  ) : null}
                </fieldset>
              )
            ) : null}
          </Panel>

          {/* ── Métriques ───────────────────────────────────────────── */}
          <Panel
            title="Métriques à simuler"
            description="Le curseur balaie les ordres de grandeur (échelle logarithmique) ; le champ accepte la valeur exacte."
            bodyClassName="flex flex-col gap-3 p-3 feed-2:p-4"
          >
            {METRICS.map((metric) => {
              const isComments = metric.key === 'comments';
              const disabled = isComments && !commentsEnabled;
              return (
                <BoostMetricField
                  key={metric.key}
                  name={metric.key}
                  label={metric.label}
                  icon={metric.icon}
                  max={metric.max}
                  shortcuts={metric.shortcuts}
                  value={metrics[metric.key]}
                  onChange={(value) => setMetric(metric.key, value)}
                  hint={metric.hint}
                  error={errors[metric.key]}
                  disabled={disabled}
                  disabledReason={
                    disabled
                      ? 'Les commentaires créent de vraies lignes attachées à une vidéo : choisis « Une vidéo précise » comme cible pour activer ce champ.'
                      : undefined
                  }
                />
              );
            })}
          </Panel>

          {/* ── Étalement ───────────────────────────────────────────── */}
          <Panel title="Répartition dans le temps" bodyClassName="flex flex-col gap-3 p-3 feed-2:p-4">
            <Input
              label="Étaler sur N jours"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={String(spreadDays)}
              containerClassName="w-full max-w-[12rem]"
              className="h-11 tabular-nums feed-3:h-10"
              error={errors.spreadDays}
              onChange={(event) => {
                const raw = event.target.value;
                setSpreadDays(raw === '' ? 1 : Math.min(365, Math.max(1, clampMetric(Number(raw), 365))));
              }}
              hint="Entre 1 et 365 jours."
            />

            {/* Rangée défilable au pouce, comme les raccourcis de métrique. */}
            <div className="kt-no-scrollbar -mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 xs:mx-0 xs:flex-wrap xs:overflow-visible xs:px-0 xs:pb-0">
              {SPREAD_PRESETS.map((days) => (
                <Button
                  key={days}
                  size="sm"
                  variant={spreadDays === days ? 'secondary' : 'outline'}
                  className="h-11 shrink-0 text-kt-base feed-3:h-8 feed-3:text-kt-sm"
                  onClick={() => setSpreadDays(days)}
                >
                  {days} jours
                </Button>
              ))}
            </div>

            <p className="flex items-start gap-2 text-kt-sm text-fg-subtle">
              <Clock3 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                Les statistiques sont réparties sur les {spreadDays} derniers jours au lieu d’être
                versées d’un bloc : les courbes du tableau de bord et des analytics restent
                crédibles.
              </span>
            </p>
          </Panel>
        </div>

        {/* ── Récapitulatif collant ─────────────────────────────────── */}
        <aside className="min-w-0 lg:sticky lg:top-20">
          <Panel title="Récapitulatif" bodyClassName="flex flex-col gap-3 p-3 feed-2:p-4">
            <div className="flex flex-col gap-1">
              <span className="text-kt-sm text-fg-muted">Cible</span>
              <span className="truncate text-kt-base text-fg">
                {targetMode === 'channel'
                  ? 'Toute la chaîne'
                  : (selectedVideo?.title ?? 'Aucune vidéo sélectionnée')}
              </span>
            </div>

            <dl className="flex flex-col gap-1.5 border-t border-border pt-3">
              {nonZeroMetrics.length === 0 ? (
                <p className="text-kt-sm text-fg-subtle">
                  Aucune métrique sélectionnée pour l’instant.
                </p>
              ) : (
                nonZeroMetrics.map((metric) => (
                  <div key={metric.key} className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-2 text-kt-sm text-fg-muted">
                      {metric.icon}
                      {metric.label}
                    </dt>
                    <dd className="text-kt-base tabular-nums text-fg">
                      +{formatCompactNumber(metrics[metric.key])}
                    </dd>
                  </div>
                ))
              )}
            </dl>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-kt-sm">
              <span className="text-fg-muted">Étalement</span>
              <span className="tabular-nums text-fg">{spreadDays} jours</span>
            </div>

            {errors.views && total === 0 ? (
              <p role="alert" className="text-kt-sm text-danger">
                {errors.views}
              </p>
            ) : null}

            {serverError ? (
              <p role="alert" className="text-kt-sm text-danger">
                {serverError}
              </p>
            ) : null}

            <Button
              variant="brand"
              fullWidth
              // Action principale de l'écran : 44 px de haut au doigt.
              className="h-11 feed-3:h-9"
              iconLeft={<Rocket size={16} />}
              loading={mutation.isPending}
              disabled={total === 0}
              onClick={handleSubmit}
            >
              Lancer la simulation
            </Button>

            {mutation.isPending ? (
              <ProgressBar indeterminate ariaLabel="Simulation en cours" size="sm" />
            ) : null}

            <p className="text-kt-sm text-fg-subtle">
              Opération lourde et non annulable : une confirmation est demandée.
            </p>
          </Panel>
        </aside>
      </div>

      {/* ── Résultat ──────────────────────────────────────────────────── */}
      {result ? (
        <Panel
          title="Résultat de la simulation"
          description={
            result.target.type === 'video'
              ? `Vidéo « ${result.target.title} »`
              : `Chaîne « ${result.target.title} »`
          }
          bodyClassName="flex flex-col gap-4 p-3 feed-2:p-4"
        >
          <div className="grid gap-3 xs:grid-cols-2 feed-3:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Vues appliquées"
              value={formatNumber(result.applied.views)}
              icon={<Eye size={16} />}
            />
            <StatCard
              label="J'aime appliqués"
              value={formatNumber(result.applied.likes)}
              icon={<ThumbsUp size={16} />}
            />
            <StatCard
              label="Je n'aime pas appliqués"
              value={formatNumber(result.applied.dislikes)}
              icon={<ThumbsDown size={16} />}
            />
            <StatCard
              label="Commentaires appliqués"
              value={formatNumber(result.applied.comments)}
              icon={<MessageSquare size={16} />}
            />
            <StatCard
              label="Abonnés appliqués"
              value={formatNumber(result.applied.subscribers)}
              icon={<UserPlus size={16} />}
            />
          </div>

          <div className="grid gap-3 xs:grid-cols-2 feed-3:grid-cols-4">
            <StatCard
              label="Commentaires de robots créés"
              value={formatNumber(result.botCommentsCreated)}
              hint="Lignes réellement écrites en base"
              icon={<Bot size={16} />}
            />
            <StatCard
              label="Abonnements de robots créés"
              value={formatNumber(result.botSubscriptionsCreated)}
              icon={<UserPlus size={16} />}
            />
            <StatCard
              label="Comptes robots créés"
              value={formatNumber(result.botUsersCreated)}
              icon={<Bot size={16} />}
            />
            <StatCard
              label="Durée d'exécution"
              value={`${(result.durationMs / 1000).toFixed(1)} s`}
              icon={<Clock3 size={16} />}
            />
          </div>
        </Panel>
      ) : null}

      {/* ── Confirmation ──────────────────────────────────────────────── */}
      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!mutation.isPending) setConfirmOpen(false);
        }}
        title="Confirmer la simulation"
        description="Cette opération écrit directement en base et ne peut pas être annulée."
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="brand"
              iconLeft={<Rocket size={16} />}
              loading={mutation.isPending}
              onClick={() => mutation.mutate(payload)}
            >
              Confirmer et lancer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-kt-sm text-fg-muted">Cible</span>
            <span className="text-kt-base text-fg">
              {targetMode === 'channel'
                ? 'Toute la chaîne'
                : (selectedVideo?.title ?? 'Vidéo sélectionnée')}
            </span>
          </div>

          <dl className="flex flex-col gap-1.5 rounded-kt border border-border bg-bg p-3">
            {nonZeroMetrics.map((metric) => (
              <div key={metric.key} className="flex items-center justify-between gap-3">
                <dt className="text-kt-base text-fg-muted">{metric.label}</dt>
                <dd className="text-kt-base tabular-nums text-fg">
                  +{formatNumber(metrics[metric.key])}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5">
              <dt className="text-kt-base text-fg-muted">Étalement</dt>
              <dd className="text-kt-base tabular-nums text-fg">{spreadDays} jours</dd>
            </div>
          </dl>

          {metrics.comments > 0 ? (
            <p className="text-kt-sm text-warning">
              {formatNumber(metrics.comments)} commentaires seront réellement écrits sous la vidéo
              par des comptes robots.
            </p>
          ) : null}

          {mutation.isPending ? (
            <ProgressBar
              indeterminate
              label="Simulation en cours — cela peut prendre quelques secondes"
              size="sm"
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
