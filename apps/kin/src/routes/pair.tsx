import { Navigate, useLocation } from "@solidjs/router";

export default function Pair() {
  const location = useLocation();
  return <Navigate href={`/settings${location.search}${location.hash}`} />;
}
