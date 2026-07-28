'use client';

import { FilterChips, Skeleton, cn, type FilterChip } from '@kelvyntube/ui';

/** Slug de la pastille « Tout » (aucun filtre de catégorie). */
export const ALL_CATEGORY_SLUG = 'all';

export interface FeedChipsProps {
  /** Catégories renvoyées par l'API (sans la pastille « Tout »). */
  chips: FilterChip[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  /** Libellé de la première pastille. */
  allLabel?: string;
  /** `aria-label` de la rangée. */
  label?: string;
  loading?: boolean;
  /** Rend la rangée collante sous la barre supérieure fixe (`h-topbar`). */
  sticky?: boolean;
  className?: string;
}

/**
 * Rangée de filtres du feed : « Tout » suivi des catégories.
 * Collante en haut du conteneur de défilement, horizontalement scrollable
 * sans scrollbar visible sur mobile (`kt-no-scrollbar` via `FilterChips`).
 */
export function FeedChips({
  chips,
  activeSlug,
  onSelect,
  allLabel = 'Tout',
  label = 'Filtrer par catégorie',
  loading = false,
  sticky = true,
  className,
}: FeedChipsProps) {
  // L'API renvoie déjà la pastille « Tout » en tête de `HomeFeedDTO.chips`,
  // mais d'autres appelants (Tendances, Explorer) passent uniquement des
  // catégories. On déduplique donc par slug plutôt que de préfixer aveuglément.
  const items: FilterChip[] = [
    { slug: ALL_CATEGORY_SLUG, label: allLabel },
    ...chips.filter((c) => c.slug !== ALL_CATEGORY_SLUG),
  ];

  return (
    <div
      className={cn(
        'bg-bg py-3',
        // La barre supérieure du shell est fixe : on s'y accroche juste dessous.
        sticky && 'sticky top-topbar z-20',
        className,
      )}
    >
      {loading ? (
        <div className="kt-no-scrollbar flex items-center gap-3 overflow-hidden py-1">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-8 w-24 shrink-0 rounded-pill"
            />
          ))}
        </div>
      ) : (
        <FilterChips
          chips={items}
          activeSlug={activeSlug}
          onSelect={onSelect}
          label={label}
        />
      )}
    </div>
  );
}
