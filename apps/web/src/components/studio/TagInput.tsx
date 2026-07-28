'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Hash, Plus, TrendingUp, X } from 'lucide-react';
import { ROUTES, normalizeTag, type TagDTO } from '@kelvyntube/shared';
import { Input, cn } from '@kelvyntube/ui';
import { api } from '@/lib/api';
import { studioKeys } from './studio-api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SAISIE DE TAGS
 *  Validation par « Entrée » ou virgule, puces supprimables, et suggestions
 *  de hashtags tendances issues de `GET ROUTES.tags.suggest`.
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
  hint = 'Séparez les tags par une virgule ou la touche Entrée.',
  disabled = false,
  withSuggestions = true,
  id,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');

  // Débounce de la saisie avant d'interroger l'API de suggestions.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(draft.trim()), 250);
    return () => clearTimeout(timer);
  }, [draft]);

  const suggestionsQuery = useQuery({
    queryKey: studioKeys.tagSuggestions(debounced),
    queryFn: () =>
      api.get<TagDTO[]>(debounced ? ROUTES.tags.suggest : ROUTES.tags.trending, {
        ...(debounced ? { query: { q: debounced } } : {}),
      }),
    enabled: withSuggestions && !disabled,
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    const taken = new Set(value);
    return (suggestionsQuery.data ?? [])
      .filter((tag) => !taken.has(tag.name))
      .slice(0, 8);
  }, [suggestionsQuery.data, value]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
  };

  const removeTag = (tag: string) => onChange(value.filter((item) => item !== tag));

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag(draft);
      setDraft('');
      return;
    }
    // Retour arrière sur un champ vide : retire le dernier tag.
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]);
    }
  };

  const full = value.length >= max;

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        label={label}
        hint={`${hint} ${value.length}/${max}`}
        value={draft}
        disabled={disabled || full}
        placeholder={full ? 'Nombre maximum de tags atteint' : 'Ajouter un tag…'}
        iconLeft={<Hash size={16} aria-hidden="true" />}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            addTag(draft);
            setDraft('');
          }
        }}
      />

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
                className="inline-flex size-5 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg-active hover:text-fg kt-focus-ring"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {withSuggestions && suggestions.length > 0 && !full ? (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-kt-sm text-fg-muted">
            <TrendingUp size={14} aria-hidden="true" />
            {debounced ? 'Suggestions' : 'Hashtags tendances'}
          </p>
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addTag(tag.name);
                    setDraft('');
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-pill border border-border px-3 py-1',
                    'text-kt-sm text-fg-muted transition-colors',
                    'hover:border-border-strong hover:text-fg kt-focus-ring',
                  )}
                >
                  <Plus size={12} aria-hidden="true" />#{tag.name}
                  {tag.trending ? (
                    <TrendingUp size={12} aria-hidden="true" className="text-brand" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
