'use client';

import Link from 'next/link';
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react';
import { useCallback, useState, type DragEvent, type ReactNode } from 'react';
import type { VideoCardDTO } from '@kelvyntube/shared';
import { IconButton, VideoCard, cn } from '@kelvyntube/ui';
import { PATHS } from '@/lib/nav';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LISTE NUMÉROTÉE D'UNE PLAYLIST
 *  Réorganisation par glisser-déposer avec l'API HTML5 native (aucune
 *  dépendance externe) ET boutons « Monter / Descendre » utilisables au
 *  clavier : le glisser-déposer HTML5 n'étant pas pilotable au clavier, il
 *  est doublé d'un chemin accessible équivalent, doublé d'une région
 *  `aria-live` qui annonce la nouvelle position.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface PlaylistItemListProps {
  items: VideoCardDTO[];
  /** Identifiant de playlist propagé dans l'URL de visionnage (`?list=`). */
  listId?: string | null;
  /** Active la réorganisation et le retrait (propriétaire uniquement). */
  editable?: boolean;
  /** `position` est l'index de destination final (0 = première place). */
  onReorder?: (videoId: string, position: number) => void;
  onRemove?: (videoId: string) => void;
  /** Rendu lorsque la liste est vide. */
  empty?: ReactNode;
  /** Contenu ajouté après la liste (sentinelle de pagination…). */
  footer?: ReactNode;
}

/** Position d'insertion pendant un glisser-déposer. */
interface DropTarget {
  index: number;
  after: boolean;
}

export function PlaylistItemList({
  items,
  listId,
  editable = false,
  onReorder,
  onRemove,
  empty,
  footer,
}: PlaylistItemListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  /** Poignée pressée : le `li` ne devient « draggable » qu'à ce moment. */
  const [armedId, setArmedId] = useState<string | null>(null);
  /** Message annoncé aux lecteurs d'écran après un déplacement clavier. */
  const [status, setStatus] = useState('');

  const resetDrag = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
    setArmedId(null);
  }, []);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLLIElement>, videoId: string) => {
      if (!editable) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', videoId);
      setDraggingId(videoId);
    },
    [editable],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLLIElement>, index: number) => {
      if (!editable || !draggingId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      setDropTarget((current) =>
        current && current.index === index && current.after === after
          ? current
          : { index, after },
      );
    },
    [draggingId, editable],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLIElement>, index: number) => {
      if (!editable || !draggingId) return;
      event.preventDefault();

      const from = items.findIndex((item) => item.id === draggingId);
      const after = dropTarget?.index === index ? dropTarget.after : false;
      // Position d'insertion (0..n) puis conversion en index final.
      const gap = index + (after ? 1 : 0);
      const target = gap > from ? gap - 1 : gap;

      if (from !== -1 && target !== from) {
        onReorder?.(draggingId, target);
        setStatus(
          `« ${items[from].title} » déplacée en position ${target + 1} sur ${items.length}.`,
        );
      }
      resetDrag();
    },
    [draggingId, dropTarget, editable, items, onReorder, resetDrag],
  );

  /** Déplacement au clavier via les boutons Monter / Descendre. */
  const moveBy = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= items.length) return;
      const video = items[index];
      onReorder?.(video.id, target);
      setStatus(
        `« ${video.title} » déplacée en position ${target + 1} sur ${items.length}.`,
      );
    },
    [items, onReorder],
  );

  if (items.length === 0) return <>{empty}</>;

  return (
    <>
      {/* Retour vocal des déplacements clavier */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <ol className="flex flex-col gap-1">
        {items.map((video, index) => {
          const isDragging = draggingId === video.id;
          const showBefore =
            dropTarget?.index === index && !dropTarget.after && !isDragging;
          const showAfter =
            dropTarget?.index === index && dropTarget.after && !isDragging;

          return (
            <li
              key={video.id}
              draggable={editable && armedId === video.id}
              onDragStart={(event) => handleDragStart(event, video.id)}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={(event) => handleDrop(event, index)}
              onDragEnd={resetDrag}
              className={cn(
                'group/item relative flex items-center gap-2 rounded-kt p-2 transition-colors',
                'hover:bg-bg-hover',
                isDragging && 'opacity-40',
              )}
            >
              {/* Repère visuel de la position d'insertion */}
              {showBefore ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -top-0.5 h-0.5 rounded-pill bg-accent-fg"
                />
              ) : null}
              {showAfter ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-pill bg-accent-fg"
                />
              ) : null}

              {/* Numéro d'ordre — remplacé par la poignée au survol */}
              <span className="flex w-7 shrink-0 items-center justify-center">
                <span
                  className={cn(
                    'text-kt-sm tabular-nums text-fg-subtle',
                    editable && 'group-hover/item:hidden',
                  )}
                >
                  {index + 1}
                </span>
                {editable ? (
                  <span
                    aria-hidden="true"
                    title="Glisser pour réorganiser"
                    onPointerDown={() => setArmedId(video.id)}
                    onPointerUp={() => setArmedId(null)}
                    className="hidden cursor-grab text-fg-muted active:cursor-grabbing group-hover/item:block"
                  >
                    <GripVertical size={18} />
                  </span>
                ) : null}
              </span>

              <VideoCard
                video={video}
                layout="compact"
                showChannel
                linkComponent={Link}
                href={PATHS.watch(video.id, listId ? { list: listId } : undefined)}
                className="min-w-0 flex-1"
              />

              {editable ? (
                <span
                  className={cn(
                    'flex shrink-0 items-center gap-0.5 transition-opacity',
                    'lg:opacity-0 lg:group-hover/item:opacity-100 lg:group-focus-within/item:opacity-100',
                  )}
                >
                  <IconButton
                    size="sm"
                    aria-label={`Monter « ${video.title} »`}
                    disabled={index === 0}
                    onClick={() => moveBy(index, -1)}
                  >
                    <ChevronUp size={18} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Descendre « ${video.title} »`}
                    disabled={index === items.length - 1}
                    onClick={() => moveBy(index, 1)}
                  >
                    <ChevronDown size={18} />
                  </IconButton>
                  {onRemove ? (
                    <IconButton
                      size="sm"
                      aria-label={`Retirer « ${video.title} » de la playlist`}
                      onClick={() => onRemove(video.id)}
                    >
                      <X size={18} />
                    </IconButton>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {footer}
    </>
  );
}
