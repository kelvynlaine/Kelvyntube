'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CloudUpload, Film, Loader2, TriangleAlert, X } from 'lucide-react';
import {
  ROUTES,
  updateVideoSchema,
  type CategoryDTO,
  type VideoVisibility,
} from '@kelvyntube/shared';
import {
  Button,
  Input,
  ProgressBar,
  Select,
  Textarea,
  ThumbnailPicker,
  useToast,
  cn,
} from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import {
  ChunkedUploader,
  formatBytes,
  formatEta,
  formatSpeed,
  type UploadProgress,
} from '@/lib/uploader';
import { Panel } from './Panel';
import { TagInput } from './TagInput';
import { useProcessingState } from './VideoProcessingStatus';
import { studioKeys, VISIBILITY_LABELS, type StudioVideoDetailDTO } from './studio-api';
import { useChannelId } from './useStudioUrlState';

const VISIBILITY_OPTIONS: { value: VideoVisibility; label: string }[] = (
  ['PRIVATE', 'UNLISTED', 'PUBLIC'] as VideoVisibility[]
).map((v) => ({ value: v, label: VISIBILITY_LABELS[v] }));

/**
 * `/studio/[channelId]/upload`
 *
 * Reprend le modèle YouTube : l'envoi du fichier et la saisie des détails
 * se font en parallèle. L'upload est resumable (cf. `lib/uploader.ts`) et le
 * transcodage est suivi en direct par WebSocket.
 */
export function UploadScreen() {
  const channelId = useChannelId();
  const router = useRouter();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const uploaderRef = useRef<ChunkedUploader | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Formulaire de détails, saisi pendant l'envoi ────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<VideoVisibility>('PRIVATE');
  const [thumbnail, setThumbnail] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: studioKeys.categories,
    queryFn: () => api.get<CategoryDTO[]>(ROUTES.feed.categories),
    staleTime: 60 * 60_000,
  });

  // La vidéo n'existe qu'une fois `POST /upload/init` passé
  const { data: video } = useQuery({
    queryKey: studioKeys.video(videoId ?? ''),
    queryFn: () => api.get<StudioVideoDetailDTO>(ROUTES.videos.byId(videoId!)),
    enabled: Boolean(videoId) && progress?.phase !== 'uploading',
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== 'READY' && q.state.data.status !== 'FAILED'
        ? 5_000
        : false,
  });

  // Progression du transcodage poussée en direct par le worker
  const processing = useProcessingState(
    videoId ?? '',
    video?.status ?? 'UPLOADING',
    0,
    null,
  );

  const isReady = video?.status === 'READY';
  const hasFailed = video?.status === 'FAILED' || processing.status === 'FAILED';

  // ── Sélection du fichier ────────────────────────────────────────────────
  const startUpload = useCallback(
    (selected: File) => {
      if (!selected.type.startsWith('video/')) {
        toast({ message: 'Sélectionne un fichier vidéo.', variant: 'error' });
        return;
      }
      setFile(selected);
      setTitle(selected.name.replace(/\.[^.]+$/, '').slice(0, 100));

      const uploader = new ChunkedUploader({
        file: selected,
        onProgress: setProgress,
        onVideoId: setVideoId,
      });
      uploaderRef.current = uploader;

      uploader.start().catch(() => {
        /* l'état d'erreur est déjà porté par `progress` */
      });
    },
    [toast],
  );

  // Avertit avant de quitter la page pendant l'envoi
  useEffect(() => {
    const phase = progress?.phase;
    if (phase !== 'uploading' && phase !== 'preparing') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [progress?.phase]);

  // ── Publication ─────────────────────────────────────────────────────────
  const publish = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        categoryId: categoryId || null,
        tags,
        visibility,
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
      return api.patch(ROUTES.videos.update(videoId!), parsed.data);
    },
    onSuccess: () => {
      toast({ message: 'Vidéo publiée', variant: 'success' });
      router.push(PATHS.studioVideo(channelId, videoId!));
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'Formulaire invalide') return;
      toast({ message: 'Publication impossible', variant: 'error' });
    },
  });

  // ── Écran de dépôt (aucun fichier sélectionné) ──────────────────────────
  if (!file) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-kt-xl font-semibold">Mettre en ligne une vidéo</h1>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) startUpload(dropped);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-4 rounded-kt-lg border-2 border-dashed border-border bg-bg-elevated px-6 py-20 text-center transition-colors',
            dragging && 'border-accent-fg bg-accent/10',
          )}
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-bg-hover">
            <CloudUpload size={44} className="text-fg-muted" aria-hidden="true" />
          </span>
          <div>
            <p className="text-kt-md">Glissez-déposez le fichier vidéo à mettre en ligne</p>
            <p className="text-kt-sm text-fg-muted">
              Vos vidéos restent privées tant que vous ne les publiez pas.
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()}>Sélectionner un fichier</Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) startUpload(selected);
            }}
          />
          <p className="max-w-md text-kt-sm text-fg-subtle">
            L'envoi reprend automatiquement là où il s'est arrêté en cas de coupure réseau, même
            après un rechargement de la page.
          </p>
        </div>
      </div>
    );
  }

  const phase = progress?.phase ?? 'preparing';
  const uploadDone = phase === 'processing' || phase === 'done' || Boolean(video);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="kt-clamp-1 text-kt-xl font-semibold">{title || file.name}</h1>
          <p className="text-kt-sm text-fg-muted">
            {file.name} · {formatBytes(file.size)}
          </p>
        </div>
        {!uploadDone && (
          <Button
            variant="ghost"
            iconLeft={<X size={16} />}
            onClick={() => {
              void uploaderRef.current?.abort();
              setFile(null);
              setProgress(null);
              setVideoId(null);
            }}
          >
            Annuler
          </Button>
        )}
      </header>

      {/* ── Étapes : Upload → Transcodage → Prêt ───────────────────────── */}
      <Panel title="Progression">
        <ol className="mb-4 flex flex-wrap gap-4 text-kt-sm">
          <Step
            label="Envoi"
            state={uploadDone ? 'done' : phase === 'error' ? 'error' : 'active'}
          />
          <Step
            label="Transcodage"
            state={
              hasFailed ? 'error' : isReady ? 'done' : uploadDone ? 'active' : 'pending'
            }
          />
          <Step label="Prête" state={isReady ? 'done' : 'pending'} />
        </ol>

        {!uploadDone && progress && (
          <>
            <ProgressBar
              value={progress.uploadPct}
              label={`Envoi — ${progress.uploadPct} %`}
              showValue
            />
            <p className="mt-2 text-kt-sm text-fg-muted">
              {formatBytes(progress.bytesSent)} / {formatBytes(progress.bytesTotal)} ·{' '}
              {formatSpeed(progress.speedBps)} · {formatEta(progress.etaSec)} restant
            </p>
            {progress.error && (
              <p className="mt-2 flex items-center gap-2 text-kt-sm text-danger">
                <TriangleAlert size={16} aria-hidden="true" />
                {progress.error}
              </p>
            )}
          </>
        )}

        {uploadDone && !isReady && !hasFailed && (
          <>
            <ProgressBar
              value={processing.progress}
              label={`Transcodage — ${processing.progress} %`}
              showValue
            />
            <p className="mt-2 flex items-center gap-2 text-kt-sm text-fg-muted">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Génération des différentes résolutions. Vous pouvez continuer à remplir les détails.
            </p>
          </>
        )}

        {isReady && (
          <p className="flex items-center gap-2 text-kt-base text-success">
            <CheckCircle2 size={18} aria-hidden="true" />
            La vidéo est prête à être publiée.
          </p>
        )}

        {hasFailed && (
          <p className="flex items-center gap-2 text-kt-base text-danger">
            <TriangleAlert size={18} aria-hidden="true" />
            {processing.error ?? 'Le traitement a échoué.'}
          </p>
        )}
      </Panel>

      {/* ── Détails ────────────────────────────────────────────────────── */}
      <Panel title="Détails" description="Ces informations pourront être modifiées plus tard.">
        <div className="grid gap-4 feed-3:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <Input
              label="Titre (obligatoire)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              error={errors.title}
              hint={`${title.length} / 120`}
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              autoResize
              maxLength={10000}
              showCount
              hint="Astuce : ajoutez des horodatages (0:00 Introduction) pour créer des chapitres."
              error={errors.description}
            />
            <Select
              label="Catégorie"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="Choisir une catégorie"
              options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              error={errors.categoryId}
            />
            <TagInput
              value={tags}
              onChange={setTags}
              label="Tags et hashtags"
              hint="Entrée ou virgule pour valider. Les tags tendances sont suggérés."
            />
            <Select
              label="Visibilité"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as VideoVisibility)}
              options={VISIBILITY_OPTIONS}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-kt-sm font-medium">Miniature</p>
              {video?.thumbnailCandidates?.length ? (
                <ThumbnailPicker
                  options={video.thumbnailCandidates}
                  value={thumbnail ?? video.thumbnailUrl ?? undefined}
                  onChange={setThumbnail}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-kt bg-bg-hover text-kt-sm text-fg-muted">
                  <Film size={20} className="mr-2" aria-hidden="true" />
                  Miniatures générées après le transcodage
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => videoId && router.push(PATHS.studioVideos(channelId))}
          disabled={!videoId}
        >
          Enregistrer comme brouillon
        </Button>
        <Button
          disabled={!isReady || !title.trim()}
          loading={publish.isPending}
          onClick={() => publish.mutate()}
        >
          Publier
        </Button>
      </div>
    </div>
  );
}

function Step({
  label,
  state,
}: {
  label: string;
  state: 'pending' | 'active' | 'done' | 'error';
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
          state === 'done' && 'bg-success text-white',
          state === 'active' && 'bg-accent-fg text-white',
          state === 'error' && 'bg-danger text-white',
          state === 'pending' && 'bg-bg-hover text-fg-subtle',
        )}
        aria-hidden="true"
      >
        {state === 'done' ? '✓' : state === 'error' ? '!' : ''}
      </span>
      <span className={state === 'pending' ? 'text-fg-subtle' : 'text-fg'}>{label}</span>
    </li>
  );
}
