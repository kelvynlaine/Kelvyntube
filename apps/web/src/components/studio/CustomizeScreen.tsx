'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ImageUp, Plus, Trash2, X } from 'lucide-react';
import {
  ROUTES,
  updateChannelSchema,
  type ChannelDTO,
  type CursorPage,
  type VideoCardDTO,
} from '@kelvyntube/shared';
import {
  Avatar,
  Button,
  IconButton,
  Input,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
  cn,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { Panel } from './Panel';
import { StudioThumbnail, TOUCH_FIELD } from './bits';
import {
  studioKeys,
  type ChannelAssetResultDTO,
  type HandleAvailabilityDTO,
} from './studio-api';
import { useChannelId } from './useStudioUrlState';

interface ChannelLink {
  title: string;
  url: string;
}

/**
 * `/studio/[channelId]/personnalisation`
 * Image de marque, informations de base et mise en page de la chaîne.
 */
export function CustomizeScreen() {
  const channelId = useChannelId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState('branding');

  const channelQuery = useQuery({
    queryKey: studioKeys.channel(channelId),
    queryFn: () => api.get<ChannelDTO>(ROUTES.channels.byId(channelId)),
    enabled: Boolean(channelId),
  });

  const channel = channelQuery.data;

  // ── État du formulaire ──────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [links, setLinks] = useState<ChannelLink[]>([]);
  const [trailerVideoId, setTrailerVideoId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setHandle(channel.handle);
    setDescription(channel.description ?? '');
    setLocation(channel.location ?? '');
    setLinks(channel.links ?? []);
    setTrailerVideoId(channel.trailerVideoId);
  }, [channel]);

  // ── Disponibilité du handle (débounce 400 ms) ───────────────────────────
  const [debouncedHandle, setDebouncedHandle] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedHandle(handle), 400);
    return () => clearTimeout(id);
  }, [handle]);

  const handleCheck = useQuery({
    queryKey: studioKeys.handleCheck(debouncedHandle),
    queryFn: () =>
      api.get<HandleAvailabilityDTO>(ROUTES.channels.checkHandle, {
        query: { handle: debouncedHandle },
      }),
    enabled: debouncedHandle.length >= 3 && debouncedHandle !== channel?.handle,
  });

  // ── Vidéos de la chaîne (choix de la bande-annonce) ─────────────────────
  const videosQuery = useQuery({
    queryKey: ['studio', 'trailer-candidates', channelId],
    queryFn: () =>
      api.get<CursorPage<VideoCardDTO>>(ROUTES.channels.videos(channelId), {
        query: { limit: 30 },
      }),
    enabled: Boolean(channelId) && tab === 'layout',
  });

  // ── Enregistrement ──────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        handle: handle.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        links: links.filter((l) => l.title.trim() && l.url.trim()),
        trailerVideoId,
      };
      const parsed = updateChannelSchema.safeParse(payload);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.errors) {
          fieldErrors[issue.path.join('.') || '_'] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error('Formulaire invalide');
      }
      setErrors({});
      return api.patch<ChannelDTO>(ROUTES.channels.update(channelId), parsed.data);
    },
    onSuccess: () => {
      toast({ message: 'Chaîne mise à jour', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: studioKeys.channel(channelId) });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'Formulaire invalide') return;
      toast({ message: 'Enregistrement impossible', variant: 'error' });
    },
  });

  if (channelQuery.isLoading || !channel) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" className="h-9 w-64 rounded-kt" />
        <Skeleton variant="rect" className="h-48 w-full rounded-kt" />
        <Skeleton variant="rect" className="h-64 w-full rounded-kt" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-kt-xl font-semibold">Personnalisation de la chaîne</h1>
          <p className="truncate text-kt-sm text-fg-muted">@{channel.handle}</p>
        </div>
        <Button className="h-11 feed-3:h-9" loading={save.isPending} onClick={() => save.mutate()}>
          Publier
        </Button>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        panelIdPrefix="studio-customize"
        items={[
          { id: 'branding', label: 'Image de marque' },
          { id: 'basic', label: 'Informations de base' },
          { id: 'layout', label: 'Mise en page' },
        ]}
      />

      {/* ── Image de marque ───────────────────────────────────────────── */}
      {tab === 'branding' && (
        <section
          id="studio-customize-branding"
          role="tabpanel"
          aria-labelledby="studio-customize-tab-branding"
          className="flex flex-col gap-4"
        >
          <AssetUploader
            channelId={channelId}
            type="avatar"
            title="Photo de profil"
            description="Elle apparaît à côté de vos vidéos et de vos commentaires. Format carré, 800 × 800 recommandé."
            currentUrl={channel.avatarUrl}
            channelName={channel.name}
          />
          <AssetUploader
            channelId={channelId}
            type="banner"
            title="Bannière"
            description="Affichée en haut de votre chaîne. Ratio 16:9, 2560 × 1440 recommandé — la zone centrale reste visible sur tous les écrans."
            currentUrl={channel.bannerUrl}
            channelName={channel.name}
          />
        </section>
      )}

      {/* ── Informations de base ──────────────────────────────────────── */}
      {tab === 'basic' && (
        <section
          id="studio-customize-basic"
          role="tabpanel"
          aria-labelledby="studio-customize-tab-basic"
          className="flex flex-col gap-4"
        >
          <Panel title="Nom et identifiant">
            <div className="flex flex-col gap-4">
              <Input
                className={TOUCH_FIELD}
                label="Nom de la chaîne"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                error={errors.name}
              />
              <div>
                <Input
                  className={TOUCH_FIELD}
                  label="Handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))}
                  maxLength={30}
                  iconLeft={<span className="text-fg-muted">@</span>}
                  error={errors.handle}
                  hint="Lettres, chiffres, point, tiret et underscore."
                />
                {debouncedHandle !== channel.handle && debouncedHandle.length >= 3 && (
                  <p
                    className={cn(
                      'mt-1 flex items-center gap-1.5 text-kt-sm',
                      handleCheck.data?.available ? 'text-success' : 'text-danger',
                    )}
                    role="status"
                  >
                    {handleCheck.isFetching ? (
                      'Vérification…'
                    ) : handleCheck.data?.available ? (
                      <>
                        <Check size={14} aria-hidden="true" /> @{debouncedHandle} est disponible
                      </>
                    ) : (
                      <>
                        <X size={14} aria-hidden="true" /> @{debouncedHandle} est déjà pris
                      </>
                    )}
                  </p>
                )}
                {!handleCheck.data?.available && handleCheck.data?.suggestions.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {handleCheck.data.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        // `.kt-chip` ne fait que 32 px de haut.
                        className="kt-chip min-h-11 feed-3:min-h-0"
                        onClick={() => setHandle(s)}
                      >
                        @{s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="Description">
            <Textarea
              label="Description de la chaîne"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              autoResize
              maxLength={5000}
              showCount
              error={errors.description}
            />
          </Panel>

          <Panel
            title="Liens externes"
            description="Affichés sur votre chaîne, dans l'onglet À propos."
            actions={
              <Button
                variant="secondary"
                size="sm"
                className="h-11 feed-3:h-8"
                iconLeft={<Plus size={15} />}
                disabled={links.length >= 10}
                onClick={() => setLinks([...links, { title: '', url: '' }])}
              >
                Ajouter
              </Button>
            }
          >
            {links.length === 0 ? (
              <p className="text-kt-sm text-fg-muted">Aucun lien pour le moment.</p>
            ) : (
              <ul className="flex flex-col gap-4 feed-2:gap-3">
                {links.map((link, index) => (
                  // Titre et URL s'empilent en mobile : côte à côte, sur
                  // 320 px, l'URL n'aurait qu'une trentaine de pixels utiles.
                  // Le bouton « supprimer » reste ancré à droite de la ligne.
                  <li
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 feed-2:grid-cols-[12rem_minmax(0,1fr)_auto]"
                  >
                    <Input
                      className={TOUCH_FIELD}
                      label={index === 0 ? 'Titre' : undefined}
                      aria-label={`Titre du lien ${index + 1}`}
                      value={link.title}
                      maxLength={40}
                      onChange={(e) =>
                        setLinks(
                          links.map((l, i) => (i === index ? { ...l, title: e.target.value } : l)),
                        )
                      }
                      containerClassName="min-w-0"
                    />
                    <Input
                      className={TOUCH_FIELD}
                      label={index === 0 ? 'URL' : undefined}
                      aria-label={`URL du lien ${index + 1}`}
                      type="url"
                      value={link.url}
                      placeholder="https://"
                      onChange={(e) =>
                        setLinks(
                          links.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)),
                        )
                      }
                      containerClassName="col-span-2 min-w-0 feed-2:col-span-1"
                    />
                    <IconButton
                      aria-label={`Supprimer le lien ${index + 1}`}
                      className="row-start-1 size-11 self-end feed-2:row-start-auto feed-2:size-10"
                      onClick={() => setLinks(links.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={17} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Localisation">
            <Input
              className={TOUCH_FIELD}
              label="Pays ou région"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={80}
              error={errors.location}
            />
          </Panel>
        </section>
      )}

      {/* ── Mise en page ──────────────────────────────────────────────── */}
      {tab === 'layout' && (
        <section
          id="studio-customize-layout"
          role="tabpanel"
          aria-labelledby="studio-customize-tab-layout"
        >
          <Panel
            title="Bande-annonce de la chaîne"
            description="Diffusée automatiquement aux visiteurs qui ne sont pas encore abonnés."
          >
            {videosQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-3 feed-3:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rect" className="aspect-video w-full rounded-kt" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 feed-3:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setTrailerVideoId(null)}
                  aria-pressed={trailerVideoId === null}
                  className={cn(
                    'flex aspect-video items-center justify-center rounded-kt border-2 text-kt-sm transition-colors',
                    trailerVideoId === null
                      ? 'border-accent-fg bg-accent/10'
                      : 'border-border hover:bg-bg-hover',
                  )}
                >
                  Aucune bande-annonce
                </button>
                {videosQuery.data?.items.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setTrailerVideoId(v.id)}
                    aria-pressed={trailerVideoId === v.id}
                    className={cn(
                      'overflow-hidden rounded-kt border-2 text-left transition-colors',
                      trailerVideoId === v.id
                        ? 'border-accent-fg'
                        : 'border-transparent hover:border-border',
                    )}
                  >
                    <StudioThumbnail url={v.thumbnailUrl} className="aspect-video w-full" />
                    <span className="kt-clamp-2 block p-2 text-kt-sm">{v.title}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </section>
      )}
    </div>
  );
}

/** Upload d'avatar ou de bannière avec aperçu et zone de sécurité. */
function AssetUploader({
  channelId,
  type,
  title,
  description,
  currentUrl,
  channelName,
}: {
  channelId: string;
  type: 'avatar' | 'banner';
  title: string;
  description: string;
  currentUrl: string | null;
  channelName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [preview, setPreview] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.post<ChannelAssetResultDTO>(
        ROUTES.channels.uploadAsset(channelId),
        form,
        { query: { type } },
      );
    },
    onSuccess: (result) => {
      setPreview(result.url);
      toast({ message: 'Image mise à jour', variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: studioKeys.channel(channelId) });
    },
    onError: () => toast({ message: 'Envoi impossible', variant: 'error' }),
  });

  const url = preview ?? currentUrl;

  return (
    <Panel title={title} description={description}>
      <div className="flex flex-wrap items-start gap-6">
        {type === 'avatar' ? (
          <Avatar name={channelName} src={url ?? undefined} size="lg" />
        ) : (
          <div className="relative w-full max-w-md overflow-hidden rounded-kt bg-bg-hover">
            <div className="aspect-video w-full">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="size-full object-cover" />
              ) : null}
            </div>
            {/* Zone de sécurité : partie toujours visible quel que soit l'écran */}
            <div
              className="pointer-events-none absolute inset-x-[16.5%] inset-y-[25%] rounded border-2 border-dashed border-white/70"
              aria-hidden="true"
            />
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-kt-xs text-white">
              Zone toujours visible
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="h-11 feed-3:h-9"
            iconLeft={<ImageUp size={16} />}
            loading={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {url ? 'Remplacer' : 'Importer'}
          </Button>
          <p className="max-w-xs text-kt-sm text-fg-subtle">
            JPEG ou PNG, 15 Mo maximum. L'image est recadrée et optimisée automatiquement.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
          />
        </div>
      </div>
    </Panel>
  );
}
