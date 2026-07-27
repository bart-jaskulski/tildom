import { useLocation, useNavigate } from "@solidjs/router";
import { VimNavigationProvider, type VimKeymap } from "@tildom/ui";
import { type ParentProps } from "solid-js";

export default function MarkVimNavigation(props: ParentProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const keymaps: VimKeymap[] = [
    {
      lhs: ["gt", "gT"],
      callback: () => navigate(location.pathname === "/settings" ? "/" : "/settings"),
      help: "change tab",
    },
    { lhs: "h", callback: () => window.history.back(), help: "back" },
    { lhs: "l", callback: () => window.history.forward(), help: "forward" },
    {
      lhs: "/",
      callback: () => {
        const searchInput = document.querySelector("[data-mark-search]") as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      },
      help: "search",
    },
    {
      lhs: "Escape",
      callback: () => {
        if (location.pathname !== "/") navigate("/");
      },
      help: "return to bookmarks",
    },
  ];

  return <VimNavigationProvider keymaps={keymaps}>{props.children}</VimNavigationProvider>;
}
