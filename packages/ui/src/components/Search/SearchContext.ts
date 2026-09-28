import { createContext, useContext, Accessor } from "solid-js";

export interface SearchContextValue {
  query: Accessor<string>;
  onSearch: (query: string) => void;
}

export const SearchContext = createContext<SearchContextValue>();

export function useSearchContext(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("<Search.Input> and <Search.Highlight> must be used within a <Search> component.");
  }
  return ctx;
}
