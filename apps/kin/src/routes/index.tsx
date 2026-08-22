import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useVimKeymaps } from "@tildom/ui";
import AddPerson, { type AddPersonHandle } from "~/components/AddPerson";
import AppNav from "~/components/AppNav";
import PeopleLoading from "~/components/PeopleLoading";
import { dbVersion } from "~/lib/db";
import {
  contacts,
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
  const [activeIndex, setActiveIndex] = createSignal(0);
  let addPerson: AddPersonHandle | undefined;

  const openPerson = async (id: string) => navigate(await fetchContactPath(id));

  const visiblePeople = createMemo<(Contact | ContactSearchResult)[]>(() => {
    return query() ? results() ?? [] : contacts();
  });

  createEffect(() => {
    if (activeIndex() >= visiblePeople().length) setActiveIndex(Math.max(0, visiblePeople().length - 1));
  });

  const scrollActiveIntoView = () => requestAnimationFrame(() => {
    document.querySelector("[data-person-row][data-active]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  useVimKeymaps([
    { lhs: "j", callback: () => { setActiveIndex((index) => Math.min(index + 1, visiblePeople().length - 1)); scrollActiveIntoView(); }, help: "next person" },
    { lhs: "k", callback: () => { setActiveIndex((index) => Math.max(index - 1, 0)); scrollActiveIntoView(); }, help: "previous person" },
    { lhs: "gg", callback: () => { setActiveIndex(0); scrollActiveIntoView(); }, help: "first person" },
    { lhs: "G", callback: () => { setActiveIndex(Math.max(0, visiblePeople().length - 1)); scrollActiveIntoView(); }, help: "last person" },
    { lhs: ["e", "Enter"], callback: () => { const person = visiblePeople()[activeIndex()]; if (person) void openPerson(person.id); }, help: "open person" },
    { lhs: "i", callback: () => addPerson?.open(), help: "add person" },
    { lhs: "d", callback: () => { const person = visiblePeople()[activeIndex()]; if (person && window.confirm(`Delete ${person.name}?`)) void deleteContact(person.id); }, help: "delete person" },
  ]);

  return (
    <main class="kin-page">
      <AppNav active="people" />
      <section class="kin-content">
        <Show when={isContactStoreReady()} fallback={<PeopleLoading />}>
          <Show when={!query()}>
            <AddPerson ref={(handle) => { addPerson = handle; }} onCreated={(id) => void openPerson(id)} />
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

    </main>
  );
}
