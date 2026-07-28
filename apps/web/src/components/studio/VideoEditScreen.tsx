'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ExternalLink, Plus, Share2, Trash2 } from 'lucide-react';
import {
  ROUTES,
  updateVideoSchema,
  type CategoryDTO,
  type VideoAnalyticsDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import {
  Badge,
  Button,
  Checkbox,
  IconButton,
  Input,
  Select,
  Skeleton,
  StatCard,
  Tabs,
  Textarea,
  ThumbnailPicker,
  useToast,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { Panel } from './Panel';
import { TOUCH_FIELD } from './bits';
import { RangeSelect } from './RangeSelect';
import { BreakdownBars, MetricAreaChart, RetentionChart } from './charts';
import { useChartTheme } from './charts/chart-theme';
import { TagInput } from './TagInput';
import { VideoProcessingStatus } from './VideoProcessingStatus';
import {
  VISIBILITY_LABELS,
  parsePreset,
  studioKeys,
  type StudioVideoDetailDTO,
  type ThumbnailUploadResultDTO,
} from './studio-api';
import { useChannelId, useStudioUrlState, useVideoId } from './useStudioUrlState';
import {
  formatClock,
  formatHours,
  formatNumber,
  formatRatioAsPercent,
  fromDateTimeLocalValue,
  parseChapterTime,
  toDateTimeLocalValue,
} from './studio-format';

const VISIBILITIES: VideoVisibility[] = ['PRIVATE', 'UNLISTED', 'PUBLIC', 'SCHEDULED'];

interface ChapterDraft {
  startSec: number;
  title: string;
}

/**
 * `/studio/[channelId]/videos/[videoId]`
 * Onglet Détails (formulaire complet) + onglet Analytics (rétention,
 * sources de trafic, démographie).
 */
export function VideoEditScreen() {
  const channelId = useChannelId();
  const videoId = useVideoId();
  const { get } = useStudioUrlState();
  const [tab, setTab] = useState('details');

  const query = useQuery({
    queryKey: studioKeys.video(videoId),
    queryFn: () => api.get<StudioVideoDetailDTO>(ROUTES.videos.byId(videoId)),
    enabled: Boolean(videoId),
  });

  if (query.isLoading || !query.data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" className="h-9 w-80 rounded-kt" />
        <Skeleton variant="rect" className="h-[420px] w-full rounded-kt" />
      </div>
    );
  }

  const video = query.data;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="kt-clamp-1 text-kt-xl font-semibold">{video.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-kt-sm text-fg-muted">
            <Badge>{VISIBILITY_LABELS[video.visibility]}</Badge>
            <VideoProcessingStatus
              videoId={video.id}
              status={video.status}
              progress={video.status === 'READY' ? 100 : 0}
              error={null}
              compact
            />
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-11 shrink-0 feed-3:h-9"
          iconLeft={<ExternalLink size={16} />}
          onClick={() => window.open(PATHS.watch(video.id), '_blank', 'noopener')}
        >
          {/* Le libellé complet est superflu sur 320 px : « Voir » suffit,
              l'icône « lien externe » porte déjà le sens. */}
          <span className="xs:hidden">Voir</span>
          <span className="hidden xs:inline">Voir sur Kelvyn Tube</span>
        </Button>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        panelIdPrefix="studio-video"
        items={[
          { id: 'details', label: 'Détails' },
          { id: 'analytics', label: 'Analytics' },
        ]}
      />

      {tab === 'details' ? (
        <section
          id="studio-video-details"
          role="tabpanel"
          aria-labelledby="studio-video-tab-details"
        >
          <DetailsForm video={video} channelId={channelId} />
        </section>
      ) : (
        <section
          id="studio-video-analytics"
          role="tabpanel"
          aria-labelledby="studio-video-tab-analytics"
        >
          <VideoAnalyticsPanel
            channelId={channelId}
            videoId={videoId}
            durationSec={video.durationSec}
            preset={parsePreset(get('preset'))}
          />
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Onglet Détails
// ═══════════════════════════════════════════════════════════════════════════

function DetailsForm({
  video,
  channelId,
}: {
  video: StudioVideoDetailDTO;
  channelId: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [categoryId, setCategoryId] = useState(video.category?.id ?? '');
  const [tags, setTags] = useState<string[]>(video.tags.map((t) => t.name));
  const [visibility, setVisibility] = useState<VideoVisibility>(video.visibility);
  const [publishAt, setPublishAt] = useState(toDateTimeLocalValue(video.publishAt));
  const [thumbnail, setThumbnail] = useState<string | undefined>(video.thumbnailUrl ?? undefined);
  /**
   * Miniature réellement importée (distincte de `thumbnail`, qui suit juste
   * la sélection courante). Si on passait `thumbnail` comme `customUrl` du
   * `ThumbnailPicker`, une miniature actuelle qui est déjà l'une des 3
   * propositions auto-générées se retrouverait dupliquée dans la grille avec
   * un badge « Perso » erroné. On ne restaure ce statut au chargement que si
   * la miniature enregistrée n'est PAS l'une des candidates auto-générées —
   * c'est alors forcément un import précédent.
   */
  const [customThumbnail, setCustomThumbnail] = useState<string | undefined>(
    video.thumbnailUrl && !video.thumbnailCandidates.includes(video.thumbnailUrl)
      ? video.thumbnailUrl
      : undefined,
  );
  const [commentsEnabled, setCommentsEnabled] = useState(video.commentsEnabled);
  const [madeForKids, setMadeForKids] = useState(video.madeForKids ?? false);
  const [ageRestricted, setAgeRestricted] = useState(video.ageRestricted ?? false);
  const [chapters, setChapters] = useState<ChapterDraft[]>(
    video.chapters.map((c) => ({ startSec: c.startSec, title: c.title })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: studioKeys.categories,
    queryFn: () => api.get<CategoryDTO[]>(ROUTES.feed.categories),
    staleTime: 60 * 60_000,
  });

  // ── Détection des modifications non enregistrées ────────────────────────
  const dirty = useMemo(
    () =>
      title !== video.title ||
      description !== (video.description ?? '') ||
      categoryId !== (video.category?.id ?? '') ||
      visibility !== video.visibility ||
      commentsEnabled !== video.commentsEnabled ||
      thumbnail !== (video.thumbnailUrl ?? undefined) ||
      tags.join(',') !== video.tags.map((t) => t.name).join(',') ||
      chapters.length !== video.chapters.length,
    [
      title, description, categoryId, visibility, commentsEnabled,
      thumbnail, tags, chapters, video,
    ],
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId || null,
        tags,
        visibility,
        publishAt: visibility === 'SCHEDULED' ? fromDateTimeLocalValue(publishAt) : null,
        commentsEnabled,
        madeForKids,
        ageRestricted,
        chapters: chapters
          .filter((c) => c.title.trim())
          .sort((a, b) => a.startSec - b.startSec),
        ...(thumbnail ? { thumbnailUrl: thumbnail } : {}),
      };
      const parsed = updateVideoSchema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.errors) {
          fieldErrors[issue.path.join('.') || '_'] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error('Formulaire invalide');
      }
      setErrors({});
      return api.patch(ROUTES.videos.update(video.id), parsed.data);
    },
    onSuccess: () => {
      toast({ message: 'Modifications enregistrées', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: studioKeys.video(video.id) });
      void queryClient.invalidateQueries({ queryKey: ['studio', 'videos', channelId] });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'Formulaire invalide') return;
      toast({ message: 'Enregistrement impossible', variant: 'error' });
    },
  });

  const uploadThumbnail = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.put<ThumbnailUploadResultDTO>(ROUTES.videos.thumbnail(video.id), form);
    },
    onSuccess: (result) => {
      setThumbnail(result.thumbnailUrl);
      setCustomThumbnail(result.thumbnailUrl);
      toast({ message: 'Miniature mise à jour', variant: 'success' });
    },
    onError: () => toast({ message: 'Envoi de la miniature impossible', variant: 'error' }),
  });

  return (
    <div className="flex flex-col gap-4">
      {dirty && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-kt border border-warning/40 bg-warning/10 px-4 py-2 text-kt-base"
        >
          <span>Modifications non enregistrées</span>
          <Button
            size="sm"
            className="h-11 feed-3:h-8"
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Enregistrer
          </Button>
        </div>
      )}

      {/*
        En mobile, la colonne latérale passe EN PREMIER (`order-first`) :
        miniature et visibilité sont les deux décisions que l'on vient prendre
        le plus souvent, il serait absurde de les reléguer après une
        description de 8 lignes, trois cases à cocher et la liste des
        chapitres. En desktop, l'ordre visuel d'origine est rétabli.
        `minmax(0,1fr)` : sans lui, la colonne formulaire refuse de rétrécir.
      */}
      <div className="grid gap-4 feed-3:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Colonne formulaire ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-4 feed-3:order-first">
          <Panel title="Informations">
            <div className="flex flex-col gap-4">
              <Input
                className={TOUCH_FIELD}
                label="Titre (obligatoire)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                hint={`${title.length} / 120`}
                error={errors.title}
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                autoResize
                maxLength={10000}
                showCount
                hint="Les horodatages (0:00 Introduction) deviennent des chapitres cliquables."
                error={errors.description}
              />
              <Select
                className={TOUCH_FIELD}
                label="Catégorie"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                placeholder="Choisir une catégorie"
                options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
              <TagInput value={tags} onChange={setTags} label="Tags et hashtags" />
            </div>
          </Panel>

          <Panel
            title="Chapitres"
            actions={
              <Button
                variant="secondary"
                size="sm"
                className="h-11 feed-3:h-8"
                iconLeft={<Plus size={15} />}
                onClick={() => setChapters([...chapters, { startSec: 0, title: '' }])}
              >
                Ajouter
              </Button>
            }
          >
            {chapters.length === 0 ? (
              <p className="text-kt-sm text-fg-muted">
                Aucun chapitre. Ils peuvent aussi être définis directement dans la description.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {chapters.map((chapter, index) => (
                  // Grille plutôt que `flex` : à 320 px, `w-28 + flex-1 + bouton`
                  // écrasait le champ de titre à une trentaine de pixels.
                  // `minmax(0,1fr)` garantit que c'est bien le titre qui cède.
                  <li
                    key={index}
                    className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-end gap-2"
                  >
                    <Input
                      aria-label={`Début du chapitre ${index + 1}`}
                      value={formatClock(chapter.startSec)}
                      onChange={(e) => {
                        const parsed = parseChapterTime(e.target.value);
                        if (parsed !== null) {
                          setChapters(
                            chapters.map((c, i) =>
                              i === index ? { ...c, startSec: parsed } : c,
                            ),
                          );
                        }
                      }}
                      className={`${TOUCH_FIELD} px-2 tabular-nums`}
                      containerClassName="min-w-0"
                    />
                    <Input
                      aria-label={`Titre du chapitre ${index + 1}`}
                      className={TOUCH_FIELD}
                      value={chapter.title}
                      maxLength={100}
                      onChange={(e) =>
                        setChapters(
                          chapters.map((c, i) =>
                            i === index ? { ...c, title: e.target.value } : c,
                          ),
                        )
                      }
                      containerClassName="min-w-0"
                    />
                    <IconButton
                      aria-label={`Supprimer le chapitre ${index + 1}`}
                      className="size-11 feed-3:size-10"
                      onClick={() => setChapters(chapters.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={17} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Options">
            <div className="flex flex-col gap-3">
              <Checkbox
                label="Autoriser les commentaires"
                checked={commentsEnabled}
                onChange={(e) => setCommentsEnabled(e.target.checked)}
              />
              <Checkbox
                label="Contenu conçu pour les enfants"
                description="Obligatoire si la vidéo s'adresse principalement à un public enfant."
                checked={madeForKids}
                onChange={(e) => setMadeForKids(e.target.checked)}
              />
              <Checkbox
                label="Limite d'âge (déconseillé aux moins de 18 ans)"
                checked={ageRestricted}
                onChange={(e) => setAgeRestricted(e.target.checked)}
              />
            </div>
          </Panel>
        </div>

        {/* ── Colonne latérale ────────────────────────────────────────── */}
        <div className="order-first flex min-w-0 flex-col gap-4 feed-3:order-none">
          <Panel title="Miniature">
            <ThumbnailPicker
              options={video.thumbnailCandidates}
              value={thumbnail}
              onChange={setThumbnail}
              customUrl={customThumbnail}
              onCustomFile={(file) => uploadThumbnail.mutate(file)}
              uploading={uploadThumbnail.isPending}
            />
          </Panel>

          <Panel title="Visibilité">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Visibilité de la vidéo</legend>
              {VISIBILITIES.map((v) => (
                // `min-h-11` : le bouton radio natif fait 16 px ; c'est le
                // libellé entier qui sert de cible tactile, on lui donne donc
                // une hauteur de 44 px.
                <label
                  key={v}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-kt feed-3:min-h-0 feed-3:items-start"
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={v}
                    checked={visibility === v}
                    onChange={() => setVisibility(v)}
                    className="size-4 shrink-0 accent-[color:rgb(var(--kt-accent-fg))] feed-3:mt-1"
                  />
                  <span className="text-kt-base">{VISIBILITY_LABELS[v]}</span>
                </label>
              ))}
            </fieldset>
            {visibility === 'SCHEDULED' && (
              <Input
                className={TOUCH_FIELD}
                type="datetime-local"
                label="Date de publication"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                error={errors.publishAt}
                containerClassName="mt-3"
              />
            )}
          </Panel>

          <Panel title="Lien de partage">
            <div className="flex items-center gap-2">
              <Input
                className={TOUCH_FIELD}
                readOnly
                aria-label="Lien de la vidéo"
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}${PATHS.watch(video.id)}`}
                containerClassName="min-w-0 flex-1"
              />
              <IconButton
                aria-label="Copier le lien"
                className="size-11 feed-3:size-10"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    `${window.location.origin}${PATHS.watch(video.id)}`,
                  );
                  toast({ message: 'Lien copié', variant: 'success' });
                }}
              >
                <Share2 size={17} />
              </IconButton>
            </div>
          </Panel>
        </div>
      </div>

      {/* Actions finales : empilées et pleine largeur au pouce, alignées à
          droite dès qu'il y a de la place. */}
      <div className="flex flex-col-reverse gap-2 xs:flex-row xs:justify-end">
        <Link
          href={PATHS.studioVideos(channelId)}
          className="kt-btn-secondary min-h-11 justify-center xs:min-h-0"
        >
          Retour au contenu
        </Link>
        <Button
          className="h-11 xs:h-9"
          loading={save.isPending}
          disabled={!dirty}
          onClick={() => save.mutate()}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Onglet Analytics
// ═══════════════════════════════════════════════════════════════════════════

function VideoAnalyticsPanel({
  channelId,
  videoId,
  durationSec,
  preset,
}: {
  channelId: string;
  videoId: string;
  durationSec: number;
  preset: ReturnType<typeof parsePreset>;
}) {
  const theme = useChartTheme();

  const query = useQuery({
    queryKey: studioKeys.videoAnalytics(channelId, videoId, preset),
    queryFn: () =>
      api.get<VideoAnalyticsDTO>(ROUTES.studio.videoAnalytics(channelId, videoId), {
        query: { preset },
      }),
    enabled: Boolean(channelId && videoId),
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 feed-3:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" className="h-28 w-full rounded-kt" />
          ))}
        </div>
        <Skeleton variant="rect" className="h-[320px] w-full rounded-kt" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Panel>
        <p className="flex items-center gap-2 text-kt-base text-fg-muted">
          <BarChart3 size={18} aria-hidden="true" />
          Statistiques indisponibles pour cette vidéo.
        </p>
      </Panel>
    );
  }

  const { totals, viewsOverTime, retention, trafficSources, devices, countries, ageGroups } =
    query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RangeSelect value={preset} />
      </div>

      <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 feed-3:grid-cols-4">
        <StatCard label="Vues" value={formatNumber(totals.views)} />
        <StatCard label="Temps de visionnage" value={formatHours(totals.watchTimeHours)} />
        <StatCard
          label="Durée moyenne"
          value={formatClock(totals.avgViewDurationSec)}
          hint={`${Math.round(totals.avgViewPct)} % de la vidéo`}
        />
        <StatCard
          label="Taux de clic"
          value={formatRatioAsPercent(totals.ctr)}
          hint={`${formatNumber(totals.impressions)} impressions`}
        />
      </div>

      <Panel title="Vues dans le temps" bodyClassName="p-2 feed-3:p-4">
        <MetricAreaChart
          points={viewsOverTime}
          seriesName="Vues"
          formatValue={formatNumber}
          color={theme.accent}
          height={260}
        />
      </Panel>

      <Panel
        title="Rétention d'audience"
        description="Pourcentage de spectateurs encore présents à chaque instant de la vidéo."
        bodyClassName="p-2 feed-3:p-4"
      >
        <RetentionChart retention={retention} durationSec={durationSec} height={280} />
      </Panel>

      <div className="grid gap-4 feed-3:grid-cols-2">
        <Panel title="Sources de trafic">
          <BreakdownBars
            rows={trafficSources.map((s) => ({
              label: TRAFFIC_LABELS[s.source] ?? s.source,
              value: s.views,
              pct: s.pct,
            }))}
            color={theme.accent}
          />
        </Panel>
        <Panel title="Appareils">
          <BreakdownBars
            rows={devices.map((d) => ({
              label: DEVICE_LABELS[d.device] ?? d.device,
              value: d.views,
              pct: d.pct,
            }))}
            color={theme.success}
          />
        </Panel>
        <Panel title="Pays">
          <BreakdownBars
            rows={countries.map((c) => ({ label: c.country, value: c.views, pct: c.pct }))}
            color={theme.warning}
          />
        </Panel>
        <Panel title="Tranches d'âge">
          <BreakdownBars
            rows={ageGroups.map((a) => ({ label: a.bucket, pct: a.pct }))}
            valueLabel=""
            color={theme.brand}
          />
        </Panel>
      </div>
    </div>
  );
}

const TRAFFIC_LABELS: Record<string, string> = {
  HOME: "Page d'accueil",
  SEARCH: 'Recherche Kelvyn Tube',
  SUGGESTED: 'Vidéos suggérées',
  CHANNEL: 'Pages de chaîne',
  EXTERNAL: 'Sites externes',
  PLAYLIST: 'Playlists',
  SHORTS: 'Feed Shorts',
  NOTIFICATION: 'Notifications',
  DIRECT: 'Accès direct',
};

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: 'Ordinateur',
  MOBILE: 'Mobile',
  TABLET: 'Tablette',
  TV: 'Téléviseur',
  UNKNOWN: 'Inconnu',
};
