import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useVimKeymaps } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import { dbVersion } from "~/lib/db";
import {
  contacts,
  createContact,
  deleteContact,
  fetchContactPath,
  isContactStoreReady,
  searchContacts,
  type Contact,
  type ContactSearchResult,
} from "~/stores/contactStore";
import styles from "./index.module.css";

const searchTerms = (query: string): string[] => query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];

const Highlight = (props: { text: string; query: string }) => {
  const terms = searchTerms(props.query).sort((left, right) => right.length - left.length);
  if (!terms.length) return props.text;
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return <For each={props.text.split(new RegExp(`(${pattern})`, "gi"))}>{(part) =>
    terms.includes(part.toLowerCase()) ? <mark class={styles.highlight}>{part}</mark> : part
  }</For>;
};

export default function Home() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = createMemo(() => String(params.q ?? "").trim());
  const [results] = createResource(
    () => isContactStoreReady() && query() ? [query(), dbVersion()] as const : null,
    ([value]) => searchContacts(value),
  );
  const [sortAscending, setSortAscending] = createSignal(true);
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [name, setName] = createSignal("");
  const [relationship, setRelationship] = createSignal("");
  const [location, setLocation] = createSignal("");
  let addDialog: HTMLDialogElement | undefined;
  let nameInput: HTMLInputElement | undefined;

  const openPerson = async (id: string) => navigate(await fetchContactPath(id));

  const visiblePeople = createMemo<(Contact | ContactSearchResult)[]>(() => {
    const rows = query() ? results() ?? [] : contacts();
    return sortAscending() ? rows : [...rows].reverse();
  });

  createEffect(() => {
    if (activeIndex() >= visiblePeople().length) setActiveIndex(Math.max(0, visiblePeople().length - 1));
  });

  const scrollActiveIntoView = () => requestAnimationFrame(() => {
    document.querySelector("[data-person-row][data-active]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  const openAdd = () => {
    addDialog?.showModal();
    queueMicrotask(() => nameInput?.focus());
  };

  useVimKeymaps([
    { lhs: "j", callback: () => { setActiveIndex((index) => Math.min(index + 1, visiblePeople().length - 1)); scrollActiveIntoView(); }, help: "next person" },
    { lhs: "k", callback: () => { setActiveIndex((index) => Math.max(index - 1, 0)); scrollActiveIntoView(); }, help: "previous person" },
    { lhs: "gg", callback: () => { setActiveIndex(0); scrollActiveIntoView(); }, help: "first person" },
    { lhs: "G", callback: () => { setActiveIndex(Math.max(0, visiblePeople().length - 1)); scrollActiveIntoView(); }, help: "last person" },
    { lhs: ["e", "Enter"], callback: () => { const person = visiblePeople()[activeIndex()]; if (person) void openPerson(person.id); }, help: "open person" },
    { lhs: "i", callback: openAdd, help: "add person" },
    { lhs: "d", callback: () => { const person = visiblePeople()[activeIndex()]; if (person && window.confirm(`Delete ${person.name}?`)) void deleteContact(person.id); }, help: "delete person" },
  ]);

  const addPerson = async (event: SubmitEvent) => {
    event.preventDefault();
    const id = await createContact(name(), relationship(), location());
    setName(""); setRelationship(""); setLocation("");
    addDialog?.close();
    await openPerson(id);
  };

  return (
    <main class="kin-page">
      <AppNav active="people" />
      <section class="kin-content">
        <Show when={isContactStoreReady()} fallback={<p class={styles.feedNote}>~/kin.db opening local directory █</p>}>
          <Show when={!query()}>
            <div class={styles.toolbar}>
              <button type="button" class="kin-button" onClick={() => setSortAscending(!sortAscending())}>[ sort: name {sortAscending() ? "▲" : "▼"} ]</button>
              <button type="button" class="kin-primary-button" onClick={openAdd}>add person</button>
            </div>
          </Show>

          <Show when={query()}>
            <p class={styles.feedNote}>Search results for <b>{query()}</b>. <a href="/">newest</a></p>
          </Show>
          <Show when={query() && results.loading}><p class={styles.feedNote}>Searching…</p></Show>

          <Show when={visiblePeople().length > 0}>
            <ol class={styles.peopleList}>
              <For each={visiblePeople()}>{(person, index) => (
                <li class={styles.peopleItem}>
                  <article
                    class={styles.personRow}
                    classList={{ [styles.activeRow]: index() === activeIndex() }}
                    data-person-row
                    data-active={index() === activeIndex() ? "" : undefined}
                  >
                    <button type="button" class={styles.personLink} onClick={() => void openPerson(person.id)}>
                      <span class={styles.personName}><Highlight text={person.name} query={query()} /></span>
                      <span class={styles.personMeta}>
                        {person.relationship && `[ ${person.relationship} ]`}
                        {person.relationship && person.location && " · "}
                        {person.location && <Highlight text={person.location} query={query()} />}
                      </span>
                    </button>
                    <Show when={"matches" in person && person.matches.length > 0}>
                      <div class={styles.matches}>
                        <For each={(person as ContactSearchResult).matches}>{(match) => (
                          <button type="button" class={styles.match} onClick={() => void openPerson(person.id)}>
                            <span class={styles.matchMeta}>
                              [ {match.kind} ]{match.createdAt ? ` ${new Date(match.createdAt).toLocaleString()}` : ""}
                            </span>
                            <span><Highlight text={match.text} query={query()} /></span>
                          </button>
                        )}</For>
                      </div>
                    </Show>
                  </article>
                </li>
              )}</For>
            </ol>
          </Show>

          <Show when={!results.loading && visiblePeople().length === 0}>
            <p class={styles.feedNote}>{query() ? "No local matches." : "No people yet."}</p>
          </Show>
        </Show>
      </section>

      <dialog ref={addDialog} class={styles.addDialog} onClose={() => { setName(""); setRelationship(""); setLocation(""); }}>
        <form method="dialog" class={styles.dialogForm} onSubmit={addPerson}>
          <h2>Add record to people.db</h2>
          <label>Full name<input ref={nameInput} class="kin-input" value={name()} placeholder="e.g. John Doe" onInput={(event) => setName(event.currentTarget.value)} required /></label>
          <label>Relationship type<input class="kin-input" value={relationship()} placeholder="e.g. colleague / friend / family" onInput={(event) => setRelationship(event.currentTarget.value)} /></label>
          <label>Location<input class="kin-input" value={location()} placeholder="e.g. Berlin, DE" onInput={(event) => setLocation(event.currentTarget.value)} /></label>
          <div class={styles.dialogActions}>
            <button type="button" class="kin-button" onClick={() => addDialog?.close()}>cancel</button>
            <button type="submit" class="kin-primary-button">add record</button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
