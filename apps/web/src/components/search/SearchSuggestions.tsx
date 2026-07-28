'use client';

import {
  ROUTES,
  formatCompactNumber,
  type ChannelSummaryDTO,
  type SearchSuggestionDTO,
} from '@kelvyntube/shared';
import { Avatar, VerifiedBadge, cn, useOnClickOutside } from '@kelvyntube/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Clock, Hash, Search, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { api } from '@/lib/api';
import { PATHS } from '@/lib/nav';
import { pushRecentSearch, useRecentSearches } from './useRecentSearches';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PANNEAU D'AUTOCOMPLÉTION DE LA RECHERCHE
 *  Rendu en position absolue sous la barre de recherche du layout principal.
 *  Le composant ne possède pas le champ de saisie : il se contente de
 *  l'annoter (rôle combobox, `aria-controls`, `aria-activedescendant`) et
 *  d'écouter le clavier au niveau du document.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SearchSuggestionsProps {
  /** Texte saisi dans la barre de recherche. */
  query: string;
  /** L'utilisateur a choisi une suggestion (texte de requête) ou une entité (href). */
  onSelect: (value: { text: string; href?: string }) => void;
  /** Fermeture demandée (Échap, clic extérieur). */
  onClose: () => void;
}

/** Délai avant interrogation du serveur, en millisecondes. */
const DEBOUNCE_MS = 200;
/** Longueur minimale de saisie déclenchant une requête serveur. */
const MIN_QUERY_LENGTH = 2;
/** Nombre maximal de lignes affichées dans le panneau. */
const MAX_ROWS = 12;

type SuggestionKind = 'recent' | 'query' | 'channel' | 'tag';

interface SuggestionRow {
  key: string;
  kind: SuggestionKind;
  /** Texte injecté dans la barre de recherche. */
  text: string;
  /** Libellé affiché (peut différer du texte, ex. « #tag »). */
  label: string;
  /** Destination lorsque la ligne pointe vers une entité. */
  href?: string;
  channel?: ChannelSummaryDTO;
}

/** Minuscules sans diacritiques — la longueur des chaînes est préservée. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
}

/** Met en gras la portion du libellé correspondant à la saisie. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  const index = trimmed ? normalize(text).indexOf(normalize(trimmed)) : -1;

  if (index < 0) return <span className="truncate">{text}</span>;

  return (
    <span className="truncate">
      {text.slice(0, index)}
      <strong className="font-semibold text-fg">
        {text.slice(index, index + trimmed.length)}
      </strong>
      {text.slice(index + trimmed.length)}
    </span>
  );
}

export default function SearchSuggestions({
  query,
  onSelect,
  onClose,
}: SearchSuggestionsProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const listboxId = `kt-search-suggestions-${rawId}`;
  const optionId = useCallback((index: number) => `${listboxId}-option-${index}`, [listboxId]);

  const trimmed = query.trim();
  const { items: recents, remove: removeRecent } = useRecentSearches();

  // ── Débounce de 200 ms sur la saisie ─────────────────────────────────────
  const [debounced, setDebounced] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const canQuery = debounced.length >= MIN_QUERY_LENGTH;

  // ── Suggestions serveur (`keepPreviousData` évite le clignotement) ───────
  const { data: suggestions } = useQuery({
    queryKey: ['search-suggest', debounced],
    queryFn: () =>
      api.get<SearchSuggestionDTO[]>(ROUTES.search.suggest, {
        query: { q: debounced },
        allowAnonymous: true,
      }),
    enabled: canQuery,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // ── Assemblage des lignes : historique d'abord, puis serveur ─────────────
  const rows = useMemo<SuggestionRow[]>(() => {
    const out: SuggestionRow[] = [];
    const seen = new Set<string>();

    // Historique : tout l'historique si la saisie est vide ou très courte,
    // sinon uniquement les entrées correspondant à la saisie.
    const needle = normalize(trimmed);
    const matching =
      trimmed.length < MIN_QUERY_LENGTH
        ? recents
        : recents.filter((item) => normalize(item).includes(needle));

    for (const item of matching) {
      const key = normalize(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key: `recent:${key}`, kind: 'recent', text: item, label: item });
    }

    for (const suggestion of suggestions ?? []) {
      if (suggestion.type === 'channel' && suggestion.channel) {
        const channel = suggestion.channel;
        out.push({
          key: `channel:${channel.id}`,
          kind: 'channel',
          text: channel.name,
          label: channel.name,
          href: PATHS.channel(channel.handle),
          channel,
        });
        continue;
      }

      if (suggestion.type === 'tag') {
        const tag = suggestion.text.replace(/^#/, '');
        out.push({
          key: `tag:${tag}`,
          kind: 'tag',
          text: `#${tag}`,
          label: `#${tag}`,
          href: PATHS.hashtag(tag),
        });
        continue;
      }

      const key = normalize(suggestion.text);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key: `query:${key}`,
        kind: 'query',
        text: suggestion.text,
        label: suggestion.text,
      });
    }

    return out.slice(0, MAX_ROWS);
  }, [recents, suggestions, trimmed]);

  // La sélection repart de zéro dès que la liste change.
  useEffect(() => setActiveIndex(-1), [rows]);

  const select = useCallback(
    (row: SuggestionRow) => {
      // Seules les vraies requêtes alimentent l'historique local.
      if (row.kind === 'query' || row.kind === 'recent') pushRecentSearch(row.text);
      onSelect({ text: row.text, href: row.href });
    },
    [onSelect],
  );

  // ── Navigation clavier (le focus reste dans le champ de saisie) ──────────
  useEffect(() => {
    if (rows.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((index) => (index + 1) % rows.length);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((index) => (index <= 0 ? rows.length - 1 : index - 1));
          break;
        case 'Enter': {
          const row = activeIndex >= 0 ? rows[activeIndex] : undefined;
          // Sans sélection active, on laisse le formulaire se soumettre.
          if (row) {
            event.preventDefault();
            select(row);
          }
          break;
        }
        case 'Escape':
          event.preventDefault();
          onClose();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [rows, activeIndex, select, onClose]);

  // Le panneau n'existe dans le DOM que s'il a quelque chose à proposer.
  const visible = rows.length > 0;

  // ── Annotation ARIA du champ de saisie (possédé par le layout) ───────────
  useEffect(() => {
    const panel = panelRef.current;
    if (!visible || !panel) return;

    const container = panel.closest('form') ?? panel.parentElement;
    const input =
      container?.querySelector<HTMLElement>(
        'input[type="search"], input[type="text"], [role="combobox"]',
      ) ?? null;
    inputRef.current = input;
    if (!input) return;

    const hadRole = input.hasAttribute('role');
    if (!hadRole) input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listboxId);
    // Repli si l'appelant ne pilote pas lui-même `aria-expanded`.
    if (!input.hasAttribute('aria-expanded')) input.setAttribute('aria-expanded', 'true');

    return () => {
      if (!hadRole) input.removeAttribute('role');
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-activedescendant');
      inputRef.current = null;
    };
  }, [listboxId, visible]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (activeIndex >= 0) input.setAttribute('aria-activedescendant', optionId(activeIndex));
    else input.removeAttribute('aria-activedescendant');
  }, [activeIndex, optionId]);

  // ── Fermeture au clic extérieur (panneau + champ associé) ────────────────
  const outsideRefs = useMemo(() => [panelRef, inputRef], []);
  useOnClickOutside(outsideRefs, onClose, visible);

  // Rien à proposer : aucun panneau (saisie < 2 caractères sans historique,
  // ou réponse serveur vide).
  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-kt border border-border bg-bg-elevated py-2 shadow-2xl"
    >
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Suggestions de recherche"
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        className="kt-scroll max-h-[70vh] overflow-y-auto"
      >
        {rows.map((row, index) => {
          const active = index === activeIndex;

          return (
            <li
              key={row.key}
              id={optionId(index)}
              role="option"
              aria-selected={active}
              onPointerEnter={() => setActiveIndex(index)}
              // Empêche la perte de focus du champ avant le clic.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(row)}
              className={cn(
                'flex cursor-pointer items-center gap-3 px-4 py-2 text-kt-md text-fg-muted transition-colors',
                active && 'bg-bg-hover text-fg',
              )}
            >
              {row.kind === 'channel' && row.channel ? (
                <Avatar name={row.channel.name} src={row.channel.avatarUrl} size="sm" />
              ) : (
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center text-fg-subtle">
                  {row.kind === 'recent' ? (
                    <Clock size={18} />
                  ) : row.kind === 'tag' ? (
                    <Hash size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                </span>
              )}

              {row.kind === 'channel' && row.channel ? (
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 items-center gap-1 text-fg">
                    <HighlightedText text={row.channel.name} query={trimmed} />
                    {row.channel.verified ? <VerifiedBadge size={12} /> : null}
                  </span>
                  <span className="truncate text-kt-sm text-fg-muted">
                    @{row.channel.handle.replace(/^@/, '')} •{' '}
                    {formatCompactNumber(row.channel.subscriberCount)} abonnés
                  </span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  <HighlightedText text={row.label} query={trimmed} />
                </span>
              )}

              {row.kind === 'recent' ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Supprimer « ${row.text} » de l'historique`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeRecent(row.text);
                  }}
                  className="shrink-0 rounded-full p-1 text-fg-subtle transition-colors hover:bg-bg-active hover:text-fg kt-focus-ring"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
