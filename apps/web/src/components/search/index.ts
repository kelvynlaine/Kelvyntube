/**
 * Point d'entrée du module « recherche ».
 * `SearchSuggestions` est aussi importable directement (export par défaut)
 * depuis `@/components/search/SearchSuggestions`.
 */

export { default as SearchSuggestions } from './SearchSuggestions';
export type { SearchSuggestionsProps } from './SearchSuggestions';

export { ChannelResultCard } from './ChannelResultCard';
export type { ChannelResultCardProps } from './ChannelResultCard';

export { PlaylistResultCard } from './PlaylistResultCard';
export type { PlaylistResultCardProps } from './PlaylistResultCard';

export {
  DEFAULT_SEARCH_FILTERS,
  SEARCH_FILTER_GROUPS,
  SearchFilters,
  countActiveFilters,
  parseSearchFilters,
} from './SearchFilters';
export type {
  SearchFilterKey,
  SearchFiltersProps,
  SearchFilterValues,
} from './SearchFilters';

export { SearchResults, SearchResultsSkeleton } from './SearchResults';

export {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_KEY,
  clearRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
  useRecentSearches,
} from './useRecentSearches';
export type { UseRecentSearches } from './useRecentSearches';

export { useSearchTracking } from './useSearchTracking';
export type { SearchTracking } from './useSearchTracking';
