import { Title } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import ItemLoading from "~/components/ItemLoading";
import { buildSharedEntryBody, readShareTargetPayload } from "~/lib/shareTarget";
import { createEntry, isEntryStoreReady } from "~/stores/entryStore";

export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = createSignal<string | null>(null);
  const [hasAttemptedSave, setHasAttemptedSave] = createSignal(false);
  const sharePayload = createMemo(() => readShareTargetPayload(params));
  const sharedEntryBody = createMemo(() => buildSharedEntryBody(sharePayload()));

  createEffect(() => {
    if (isServer || hasAttemptedSave()) {
      return;
    }

    const entryBody = sharedEntryBody();

    if (!entryBody) {
      setHasAttemptedSave(true);
      void navigate("/", { replace: true });
      return;
    }

    if (!isEntryStoreReady()) {
      return;
    }

    setHasAttemptedSave(true);

    void createEntry(entryBody)
      .then((entryId) => {
        void navigate(`/item/${entryId}`, { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to save shared entry");
      });
  });

  return (
    <>
      <Title>Saving Shared Entry | mark.tildom</Title>
      <Show when={error()} fallback={<ItemLoading />}>
        <h1 class="hn-heading">Could not save shared entry</h1>
        <p class="hn-error">{error()}</p>
        <p class="hn-status">
          <A href="/">Back to saved links</A>
        </p>
      </Show>
    </>
  );
}
