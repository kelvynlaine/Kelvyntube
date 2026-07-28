'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Hash, Loader2, Search, TrendingUp, X } from 'lucide-react';
import { ROUTES, normalizeTag, type TagDTO } from '@kelvyntube/shared';
import { Input, useOnClickOutside, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { TOUCH_FIELD } from './bits';
import { studioKeys } from './studio-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAISIE DE TAGS / HASHTAGS
 *
 *  Le panel de suggestions est un **dropdown ancré en position absolue** :
 *  il se superpose au formulaire au lieu de s'insérer dans le flux. C'était
 *  le défaut de la version précédente — la liste, rendue en flux, poussait
 *  les champs « Visibilité » et « Miniature » vers le bas et changeait de
 *  hauteur à chaque frappe, ce qui faisait sauter toute la colonne.
 *
 *  Sans terme de recherche, `GET /tags/suggest` renvoie l'intégralité du
 *  catalogue de hashtags (les plus utilisés d'abord) ; la frappe filtre.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Désactive l'appel réseau de suggestions (barre d'actions groupées). */
  withSuggestions?: boolean;
  id?: string;
}

export function TagInput({
  value,
  onChange,
  max = 20,
  label = 'Tags',
  hint = 'Entrée ou virgule pour valider.',
  disabled = false,
  withSuggestions = true,
  id,
}: TagInputProps) {
  const generatedId = useId();
  const inputId = id ?? `tags-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useOnClickOutside([anchorRef], () => setOpen(false), open);

  // Débounce avant d'interroger l'API.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draft.trim()), 200);
    return () => clearTimeout(timer);
  }, [draft]);

  const full = value.length >= max;

  const suggestionsQuery = useQuery({
    queryKey: studioKeys.tagSuggestions(debounced),
    // Sans `q`, l'API renvoie tout le catalogue (le client `api` omet les
    // paramètres vides, donc `q: ''` n'est jamais envoyé).
    queryFn: () =>
      api.get<TagDTO[]>(ROUTES.tags.suggest, {
        query: { q: debounced || undefined, limit: 60 },
      }),
    enabled: withSuggestions && !disabled,
    staleTime: 60_000,
  });

  /** Catalogue filtré : on retire ce qui est déjà sélectionné. */
  const suggestions = useMemo(() => {
    const taken = new Set(value);
    return (suggestionsQuery.data ?? []).filter((tag) => !taken.has(tag.name));
  }, [suggestionsQuery.data, value]);

  /** Le tag exact saisi n'existe pas encore : on propose de le créer. */
  const draftTag = normalizeTag(draft);
  const canCreate =
    draftTag.length > 0 &&
    !value.includes(draftTag) &&
    !suggestions.some((t) => t.name === draftTag);

  // La liste change → on réinitialise la sélection clavier.
  useEffect(() => {
    setActiveIndex(-1);
  }, [debounced, suggestionsQuery.data]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setDraft('');
    setDebounced('');
    // Le panel reste ouvert : on enchaîne généralement plusieurs tags.
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => onChange(value.filter((item) => item !== tag));

  /** Fait défiler l'option active dans le panel. */
  const scrollActiveIntoView = (index: number) => {
    const node = listRef.current?.children[index] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) return;
      event.preventDefault();
      if (!open) setOpen(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        activeIndex < 0
          ? event.key === 'ArrowDown'
            ? 0
            : suggestions.length - 1
          : (activeIndex + delta + suggestions.length) % suggestions.length;
      setActiveIndex(next);
      scrollActiveIntoView(next);
      return;
    }

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      // Entrée sur une option surlignée = on ajoute celle-ci, sinon la saisie.
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addTag(suggestions[activeIndex].name);
        setActiveIndex(-1);
      } else {
        addTag(draft);
      }
      return;
    }

    // Retour arrière sur un champ vide : retire le dernier tag.
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Ancre du dropdown : tout ce qui est absolu se positionne par rapport à elle. */}
      <div ref={anchorRef} className="relative">
        <Input
          ref={inputRef}
          id={inputId}
          label={label}
          value={draft}
          disabled={disabled || full}
          placeholder={full ? 'Nombre maximum de tags atteint' : 'Ajouter un tag…'}
          iconLeft={<Hash size={16} aria-hidden="true" />}
          // 44 px de haut tant que la mise en page est celle du mobile
          // (la taille `md` du design system s'arrête à 40 px).
          className={TOUCH_FIELD}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 && suggestions[activeIndex]
              ? `${listboxId}-${suggestions[activeIndex].id}`
              : undefined
          }
          onChange={(event) => {
            setDraft(event.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          iconRight={
            withSuggestions ? (
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled || full}
                aria-label={open ? 'Masquer les hashtags' : 'Afficher tous les hashtags'}
                onClick={() => {
                  setOpen((o) => !o);
                  inputRef.current?.focus();
                }}
                /*
                 * `kt-tap-halo` : le chevron est posé DANS le champ (`iconRight`),
                 * l'agrandir décalerait le texte saisi. On lui adjoint donc une
                 * zone sensible transparente de 44 × 44 au doigt, comme la
                 * pastille « retirer un tag » plus bas.
                 */
                className="flex items-center text-fg-subtle transition-colors hover:text-fg disabled:opacity-50 kt-tap-halo"
              >
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={cn('transition-transform', open && 'rotate-180')}
                />
              </button>
            ) : undefined
          }
        />

        {/* ── Panel de hashtags (superposé, ne décale pas le formulaire) ── */}
        {withSuggestions && open && !disabled && !full ? (
          <div
            className={cn(
              'absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden',
              'rounded-kt border border-border bg-bg-elevated shadow-2xl animate-slide-up',
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="flex items-center gap-1.5 text-kt-sm text-fg-muted">
                <Search size={13} aria-hidden="true" />
                {debounced ? `Résultats pour « ${debounced} »` : 'Tous les hashtags'}
              </p>
              {suggestionsQuery.isFetching ? (
                <Loader2 size={13} className="animate-spin text-fg-subtle" aria-hidden="true" />
              ) : (
                <span className="text-kt-xs text-fg-subtle">{suggestions.length}</span>
              )}
            </div>

            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Hashtags disponibles"
              className="kt-scroll max-h-64 overflow-y-auto py-1"
            >
              {/* Création d'un hashtag inédit */}
              {canCreate ? (
                <li
                  id={`${listboxId}-new`}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(draftTag);
                  }}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-kt-base transition-colors hover:bg-bg-hover"
                >
                  <Hash size={14} className="text-brand" aria-hidden="true" />
                  <span>
                    Créer <span className="font-medium">#{draftTag}</span>
                  </span>
                </li>
              ) : null}

              {suggestions.map((tag, index) => (
                <li
                  key={tag.id}
                  id={`${listboxId}-${tag.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  // `onMouseDown` plutôt que `onClick` : le clic ne doit pas
                  // faire perdre le focus au champ avant l'ajout.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(tag.name);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 border-l-2 px-3 py-2 text-kt-base transition-colors',
                    index === activeIndex
                      ? 'border-accent-fg bg-bg-active'
                      : 'border-transparent hover:bg-bg-hover',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Hash size={14} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                    <span className="truncate">{tag.name}</span>
                    {tag.trending ? (
                      <TrendingUp size={13} className="shrink-0 text-brand" aria-label="Tendance" />
                    ) : null}
                  </span>
                  <span className="shrink-0 text-kt-sm text-fg-subtle">
                    {tag.usageCount > 0
                      ? `${tag.usageCount} vidéo${tag.usageCount > 1 ? 's' : ''}`
                      : 'Nouveau'}
                  </span>
                </li>
              ))}

              {suggestions.length === 0 && !canCreate ? (
                <li className="px-3 py-6 text-center text-kt-sm text-fg-subtle">
                  {suggestionsQuery.isLoading ? 'Chargement…' : 'Aucun hashtag disponible'}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      {/* ── Tags sélectionnés ─────────────────────────────────────────── */}
      {value.length > 0 ? (
        <ul aria-label="Tags sélectionnés" className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-pill bg-bg-elevated py-1 pl-3 pr-1 text-kt-sm text-fg"
            >
              <span>#{tag}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeTag(tag)}
                aria-label={`Retirer le tag ${tag}`}
                /*
                 * `kt-tap-halo` : la pastille reste visuellement à 20 px (sinon
                 * elle mangerait la largeur du tag) mais sa zone sensible passe
                 * à 44 × 44 au doigt, via un ::after transparent.
                 */
                className="inline-flex size-5 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-active hover:text-fg kt-focus-ring kt-tap-halo"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-kt-sm text-fg-subtle">
        {hint} {value.length}/{max}
      </p>
    </div>
  );
}
