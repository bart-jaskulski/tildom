import { Accessor, JSX } from "solid-js";
import { SearchContext } from "./SearchContext";
import SearchInput from "./SearchInput";
import SearchHighlight from "./SearchHighlight";

export interface SearchProps {
  query: string | Accessor<string>;
  onSearch?: (query: string) => void;
  children: JSX.Element;
}

export function SearchRoot(props: SearchProps) {
  const queryAccessor = () => (typeof props.query === "function" ? props.query() : props.query);
  const onSearch = (q: string) => props.onSearch?.(q);

  return (
    <SearchContext.Provider value={{ query: queryAccessor, onSearch }}>
      {props.children}
    </SearchContext.Provider>
  );
}

export const Search = Object.assign(SearchRoot, {
  Input: SearchInput,
  Highlight: SearchHighlight,
});

export default Search;
