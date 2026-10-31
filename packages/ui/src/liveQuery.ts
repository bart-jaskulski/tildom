import {
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

export type SubscribableDb = {
  subscribe: (listener: (event?: unknown) => void) => () => void;
};

export type LiveQueryResult<T> = ReturnType<typeof createResource<T, number>>;

/**
 * Creates a reactive database query resource that automatically refetches
 * whenever the local database client emits a change event.
 */
export function createLiveQuery<T>(
  db: SubscribableDb,
  queryFn: () => Promise<T>,
): LiveQueryResult<T> {
  const [version, setVersion] = createSignal(0);
  const [data, actions] = createResource(version, () => queryFn());

  onMount(() => {
    const unsubscribe = db.subscribe(() => {
      setVersion((v) => v + 1);
    });
    onCleanup(unsubscribe);
  });

  return [data, actions];
}
