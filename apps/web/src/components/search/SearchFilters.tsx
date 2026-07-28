'use client';

import type { SearchInput } from '@kelvyntube/shared';
import { Badge, Button, Sheet, cn, useMediaQuery } from '@kelvyntube/ui';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BARRE DE FILTRES DE RECHERCHE
 *  Les valeurs sont strictement celles de `searchSchema` (packages/shared).
 *  Sur desktop : panneau repliable à quatre colonnes.
 *  Sur mobile   : `Sheet` ancré en bas de l'écran.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type SearchFilterValues = Pick<
  SearchInput,
  'duration' | 'uploadDate' | 'type' | 'sort'
>;

export type SearchFilterKey = keyof SearchFilterValues;

/** Valeurs par défaut : identiques aux `.default()` de `searchSchema`. */
export const DEFAULT_SEARCH_FILTERS: SearchFilterValues = {
  uploadDate: 'any',
  duration: 'any',
  type: 'all',
  sort: 'relevance',
};

interface FilterOption<K extends SearchFilterKey> {
  value: SearchFilterValues[K];
  label: string;
}

interface FilterGroup<K extends SearchFilterKey = SearchFilterKey> {
  key: K;
  label: string;
  options: FilterOption<K>[];
}

const UPLOAD_DATE_OPTIONS: FilterOption<'uploadDate'>[] = [
  { value: 'any', label: 'Toutes' },
  { value: 'hour', label: 'Dernière heure' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'year', label: 'Cette année' },
];

const DURATION_OPTIONS: FilterOption<'duration'>[] = [
  { value: 'any', label: 'Toutes' },
  { value: 'short', label: 'Moins de 4 minutes' },
  { value: 'medium', label: '4 à 20 minutes' },
  { value: 'long', label: 'Plus de 20 minutes' },
];

const TYPE_OPTIONS: FilterOption<'type'>[] = [
  { value: 'all', label: 'Tout' },
  { value: 'video', label: 'Vidéo' },
  { value: 'channel', label: 'Chaîne' },
  { value: 'playlist', label: 'Playlist' },
  { value: 'short', label: 'Short' },
];

const SORT_OPTIONS: FilterOption<'sort'>[] = [
  { value: 'relevance', label: 'Pertinence' },
  { value: 'date', label: 'Date de mise en ligne' },
  { value: 'views', label: 'Nombre de vues' },
  { value: 'rating', label: 'Note' },
];

/** Les quatre groupes, dans l'ordre d'affichage. */
export const SEARCH_FILTER_GROUPS: FilterGroup[] = [
  { key: 'uploadDate', label: 'Date de mise en ligne', options: UPLOAD_DATE_OPTIONS },
  { key: 'duration', label: 'Durée', options: DURATION_OPTIONS },
  { key: 'type', label: 'Type', options: TYPE_OPTIONS },
  { key: 'sort', label: 'Trier par', options: SORT_OPTIONS },
];

/** Restreint une valeur brute d'URL aux littéraux autorisés. */
function pickValue<K extends SearchFilterKey>(
  options: FilterOption<K>[],
  raw: string | null,
  fallback: SearchFilterValues[K],
): SearchFilterValues[K] {
  const match = options.find((option) => option.value === raw);
  return match ? match.value : fallback;
}

/** Lit les filtres depuis les paramètres d'URL (valeurs inconnues ignorées). */
export function parseSearchFilters(params: URLSearchParams): SearchFilterValues {
  return {
    uploadDate: pickValue(UPLOAD_DATE_OPTIONS, params.get('uploadDate'), 'any'),
    duration: pickValue(DURATION_OPTIONS, params.get('duration'), 'any'),
    type: pickValue(TYPE_OPTIONS, params.get('type'), 'all'),
    sort: pickValue(SORT_OPTIONS, params.get('sort'), 'relevance'),
  };
}

/** Nombre de filtres différents de leur valeur par défaut. */
export function countActiveFilters(values: SearchFilterValues): number {
  return SEARCH_FILTER_GROUPS.reduce(
    (total, group) => total + (values[group.key] === DEFAULT_SEARCH_FILTERS[group.key] ? 0 : 1),
    0,
  );
}

// ── Groupes de boutons radio ─────────────────────────────────────────────────

interface FilterGroupsProps {
  values: SearchFilterValues;
  onChange: (key: SearchFilterKey, value: string) => void;
  className?: string;
}

/**
 * Quatre `fieldset` de boutons radio natifs : la sémantique de groupe et la
 * navigation aux flèches sont fournies par le navigateur.
 */
function FilterGroups({ values, onChange, className }: FilterGroupsProps) {
  const groupId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  return (
    <div className={cn('grid grid-cols-2 gap-x-6 gap-y-8 feed-3:grid-cols-4', className)}>
      {SEARCH_FILTER_GROUPS.map((group) => (
        <fieldset key={group.key} className="min-w-0">
          <legend className="mb-2 border-b border-border pb-2 text-kt-base font-medium text-fg">
            {group.label}
          </legend>

          <div className="flex flex-col">
            {group.options.map((option) => {
              const checked = values[group.key] === option.value;

              return (
                <label
                  key={option.value}
                  /*
                   * `kt-tap-y` : dans la feuille mobile, une option de filtre
                   * ne faisait que 29 px de haut. Au doigt elle passe à 44 px ;
                   * la liste desktop reste compacte (souris = pointeur fin).
                   */
                  className="group/option flex cursor-pointer items-center rounded-kt px-2 py-1.5 kt-tap-y"
                >
                  <input
                    type="radio"
                    name={`${groupId}-${group.key}`}
                    value={option.value}
                    checked={checked}
                    onChange={() => onChange(group.key, option.value)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      'min-w-0 truncate rounded text-kt-base transition-colors',
                      'group-hover/option:text-fg',
                      'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-fg',
                      checked ? 'font-medium text-fg' : 'text-fg-muted',
                    )}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

// ── Barre de filtres ─────────────────────────────────────────────────────────

export interface SearchFiltersProps {
  values: SearchFilterValues;
  /** Un filtre a été modifié (la page met à jour l'URL via `router.replace`). */
  onChange: (key: SearchFilterKey, value: string) => void;
  /** Remise à zéro de tous les filtres. */
  onClear: () => void;
  className?: string;
}

export function SearchFilters({ values, onChange, onClear, className }: SearchFiltersProps) {
  const [open, setOpen] = useState(false);
  const panelId = `kt-search-filters-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Le point de rupture `feed-3` (900 px) sépare le panneau du `Sheet`.
  const isDesktop = useMediaQuery('(min-width: 900px)');
  const activeCount = countActiveFilters(values);

  return (
    <div className={cn('border-b border-border pb-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="md"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          iconLeft={<SlidersHorizontal size={18} aria-hidden="true" />}
          iconRight={
            isDesktop ? (
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn('transition-transform', open && 'rotate-180')}
              />
            ) : undefined
          }
        >
          Filtres
          {activeCount > 0 ? (
            <Badge variant="brand" aria-label={`${activeCount} filtre(s) actif(s)`}>
              {activeCount}
            </Badge>
          ) : null}
        </Button>

        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            iconLeft={<X size={16} aria-hidden="true" />}
          >
            Effacer les filtres
          </Button>
        ) : null}
      </div>

      {/* Desktop : panneau replié/déplié sous la barre */}
      {isDesktop ? (
        <div id={panelId} hidden={!open} className="mt-4 border-t border-border pt-5">
          <FilterGroups values={values} onChange={onChange} />
        </div>
      ) : null}

      {/* Mobile : feuille ancrée en bas */}
      <Sheet
        open={!isDesktop && open}
        onClose={() => setOpen(false)}
        side="bottom"
        title="Filtres de recherche"
        footer={
          // Le pied de la feuille est collé au bas de l'écran : on y ajoute la
          // safe-area iOS pour que les boutons ne passent pas sous la barre
          // d'accueil.
          <div className="flex items-center justify-between gap-2 pb-[env(safe-area-inset-bottom)]">
            <Button variant="ghost" size="md" onClick={onClear} disabled={activeCount === 0}>
              Effacer les filtres
            </Button>
            <Button variant="primary" size="md" onClick={() => setOpen(false)}>
              Voir les résultats
            </Button>
          </div>
        }
      >
        <FilterGroups values={values} onChange={onChange} className="px-4 py-4" />
      </Sheet>
    </div>
  );
}
