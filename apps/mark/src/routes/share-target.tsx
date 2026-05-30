import { Title } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { isServer } from "solid-js/web";
import AppNav from "~/components/AppNav";
import { buildSharedEntryBody, readShareTargetPayload } from "~/lib/shareTarget";
import { createEntry, isEntryStoreReady } from "~/stores/entryStore";

export default function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = createSignal(false);
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
    setIsSaving(true);

    void createEntry(entryBody)
      .then((entryId) => {
        void navigate(`/item/${entryId}`, { replace: true });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to save shared entry");
        setIsSaving(false);
      });
  });

  return (
    <main class="hn-page">
      <Title>Saving Shared Entry | mark.tildom</Title>
      <AppNav />

      <section class="hn-content hn-stack">
        <section class="hn-panel hn-stack" aria-live="polite">
          <h1 class="hn-heading">Saving shared entry</h1>

          <Show when={!isEntryStoreReady()}>
            <p class="hn-status">Opening local database...</p>
          </Show>

          <Show when={isEntryStoreReady() && isSaving() && !error()}>
            <p class="hn-status">Saving the shared link to your local list...</p>
          </Show>

          <Show when={error()}>
            <p class="hn-error">{error()}</p>
            <p class="hn-status">
              <A href="/">Back to saved links</A>
            </p>
          </Show>
        </section>
      </section>
    </main>
  );
}
