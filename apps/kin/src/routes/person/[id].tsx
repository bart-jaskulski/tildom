import { For, Show, createEffect, createSignal } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { useVimKeymaps } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import { dbVersion } from "~/lib/db";
import {
  contacts,
  createNote,
  createRelationship,
  deleteContact,
  deleteNote,
  deleteRelationship,
  fetchContactBySlug,
  fetchContactPath,
  fetchNotes,
  fetchRelationships,
  togglePinNote,
  updateContact,
  type Contact,
  type ContactNote,
  type SymmetricalRelationship,
} from "~/stores/contactStore";
import styles from "./person.module.css";

const formatDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
}).format(timestamp);

export default function PersonDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const routeSlug = () => params.slug ?? "";
  const contactId = () => person()?.id ?? "";
  const [person, setPerson] = createSignal<Contact | null>(null);
  const [notes, setNotes] = createSignal<ContactNote[]>([]);
  const [relationships, setRelationships] = createSignal<SymmetricalRelationship[]>([]);
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAddingRelationship, setIsAddingRelationship] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editRelationship, setEditRelationship] = createSignal("");
  const [editLocation, setEditLocation] = createSignal("");
  const [editBirthday, setEditBirthday] = createSignal("");
  const [editPhone, setEditPhone] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");
  const [relationshipRole, setRelationshipRole] = createSignal("");
  const [relationshipTarget, setRelationshipTarget] = createSignal("");
  const [noteBody, setNoteBody] = createSignal("");
  let noteInput: HTMLTextAreaElement | undefined;

  const openPerson = async (id: string, replace = false) => navigate(await fetchContactPath(id), { replace });
  const tags = () => [...new Set(notes().flatMap((note) => note.tags.trim().split(/\s+/).filter(Boolean)))].sort();
  const visibleNotes = () => selectedTag()
    ? notes().filter((note) => note.tags.includes(` ${selectedTag()} `))
    : notes();

  createEffect(async () => {
    const slug = routeSlug();
    dbVersion();
    if (!slug) return;
    const nextPerson = await fetchContactBySlug(slug);
    if (routeSlug() !== slug) return;
    if (!nextPerson) {
      if (!isSaving()) navigate("/");
      return;
    }
    setPerson(nextPerson);
    setEditName(nextPerson.name);
    setEditRelationship(nextPerson.relationship);
    setEditLocation(nextPerson.location);
    setEditBirthday(nextPerson.birthday);
    setEditPhone(nextPerson.phone);
    setEditEmail(nextPerson.email);
    setNotes(await fetchNotes(nextPerson.id));
    setRelationships(await fetchRelationships(nextPerson.id));
  });

  const removePerson = async () => {
    const current = person();
    if (!current || !window.confirm(`Delete ${current.name}? This also removes their notes and relationships.`)) return;
    await deleteContact(current.id);
    navigate("/");
  };

  useVimKeymaps([
    { lhs: "i", callback: () => noteInput?.focus(), help: "write note" },
    { lhs: "e", callback: () => { setIsEditing(true); setDetailsOpen(true); }, help: "edit person" },
    { lhs: "d", callback: () => void removePerson(), help: "delete person" },
  ]);

  const savePerson = async (event: SubmitEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await updateContact(contactId(), {
        name: editName(), relationship: editRelationship(), location: editLocation(), birthday: editBirthday(), phone: editPhone(), email: editEmail(),
      });
      setIsEditing(false);
      await openPerson(contactId(), true);
    } catch { window.alert("Failed to update person."); }
    finally { setIsSaving(false); }
  };

  const addNote = async (event: SubmitEvent) => {
    event.preventDefault();
    const body = noteBody().trim();
    if (!body) return;
    try {
      await createNote(contactId(), body, false);
      setNoteBody("");
    } catch { window.alert("Failed to save note."); }
  };

  const addRelationship = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!relationshipTarget()) return;
    try {
      await createRelationship(contactId(), relationshipTarget(), relationshipRole());
      setRelationshipTarget("");
      setRelationshipRole("");
      setIsAddingRelationship(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to add relationship.");
    }
  };

  const renderNote = (body: string) => body.split(/(#[a-zA-Z0-9_-]+)/g).map((part) => {
    if (!part.startsWith("#")) return part;
    const tag = part.slice(1).toLowerCase();
    return <button type="button" class={styles.inlineTag} onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}>{part}</button>;
  });

  return (
    <main class="kin-page">
      <AppNav active="people" />
      <section class={`kin-content ${styles.layout}`}>
        <Show when={person()} fallback={<p class={styles.loading}>Reading contact… █</p>}>
          <button
            type="button"
            class={styles.mobileToggle}
            aria-expanded={detailsOpen()}
            onClick={() => setDetailsOpen(!detailsOpen())}
          >[{detailsOpen() ? "−" : "+"}] {detailsOpen() ? "hide" : "show"} personal details</button>

          <aside class={styles.sidebar} classList={{ [styles.sidebarOpen]: detailsOpen() }}>
            <section class={styles.sidebarBlock}>
              <Show when={!isEditing()}>
                <div class={styles.profileHeading}>
                  <div>
                    <h1>{person()!.name}</h1>
                    <Show when={person()!.relationship}><span>[ {person()!.relationship} ]</span></Show>
                  </div>
                  <div class={styles.compactActions}>
                    <button type="button" class="kin-link-button" onClick={() => { setIsEditing(true); setDetailsOpen(true); }}>[ edit ]</button>
                    <button type="button" class="kin-link-button kin-danger-link" onClick={removePerson}>[ delete ]</button>
                  </div>
                </div>
                <dl class={styles.parameters}>
                  <Show when={person()!.location}><div><dt>Location</dt><dd>{person()!.location}</dd></div></Show>
                  <Show when={person()!.email}><div><dt>Email</dt><dd><a href={`mailto:${person()!.email}`}>{person()!.email}</a></dd></div></Show>
                  <Show when={person()!.phone}><div><dt>Phone</dt><dd><a href={`tel:${person()!.phone}`}>{person()!.phone}</a></dd></div></Show>
                  <Show when={person()!.birthday}><div><dt>Birthday</dt><dd>{person()!.birthday}</dd></div></Show>
                </dl>
              </Show>

              <Show when={isEditing()}>
                <form class={styles.editForm} onSubmit={savePerson}>
                  <h1>Edit profile</h1>
                  <label><span>Name</span><input class="kin-input" value={editName()} onInput={(event) => setEditName(event.currentTarget.value)} required /></label>
                  <label><span>Relationship</span><input class="kin-input" value={editRelationship()} placeholder="friend / family / colleague" onInput={(event) => setEditRelationship(event.currentTarget.value)} /></label>
                  <label><span>Location</span><input class="kin-input" value={editLocation()} onInput={(event) => setEditLocation(event.currentTarget.value)} /></label>
                  <label><span>Email</span><input class="kin-input" type="email" value={editEmail()} onInput={(event) => setEditEmail(event.currentTarget.value)} /></label>
                  <label><span>Phone</span><input class="kin-input" type="tel" value={editPhone()} onInput={(event) => setEditPhone(event.currentTarget.value)} /></label>
                  <label><span>Birthday</span><input class="kin-input" value={editBirthday()} placeholder="YYYY-MM-DD" onInput={(event) => setEditBirthday(event.currentTarget.value)} /></label>
                  <div class={styles.formActions}>
                    <button type="submit" class="kin-primary-button" disabled={isSaving()}>{isSaving() ? "saving…" : "save"}</button>
                    <button type="button" class="kin-button" onClick={() => setIsEditing(false)}>cancel</button>
                  </div>
                </form>
              </Show>
            </section>

            <section class={styles.sidebarBlock}>
              <div class={styles.blockHeading}>
                <h2>Relationships</h2>
                <Show when={!isAddingRelationship() && contacts().length > 1}>
                  <button type="button" class="kin-link-button" onClick={() => { setIsAddingRelationship(true); setDetailsOpen(true); }}>[ add ]</button>
                </Show>
              </div>
              <Show when={relationships().length === 0}><p class={styles.blockEmpty}>No relationships mapped.</p></Show>
              <ul class={styles.relationshipList}>
                <For each={relationships()}>{(relationship) => (
                  <li>
                    <button type="button" class={styles.relationshipLink} onClick={() => void openPerson(relationship.contactId)}>
                      <span>{relationship.roleLabel}:</span> {relationship.name}
                    </button>
                    <button
                      type="button"
                      class="kin-link-button kin-danger-link"
                      aria-label={`Remove relationship with ${relationship.name}`}
                      onClick={async () => { if (window.confirm("Remove this relationship?")) await deleteRelationship(contactId(), relationship.contactId); }}
                    >[×]</button>
                  </li>
                )}</For>
              </ul>
              <Show when={isAddingRelationship()}>
                <form class={styles.relationshipForm} onSubmit={addRelationship}>
                  <select class="kin-select" aria-label="Related person" value={relationshipTarget()} onChange={(event) => setRelationshipTarget(event.currentTarget.value)} required>
                    <option value="">target</option>
                    <For each={contacts().filter((contact) => contact.id !== contactId())}>{(contact) => <option value={contact.id}>{contact.name}</option>}</For>
                  </select>
                  <input
                    class="kin-input"
                    aria-label="Relationship type"
                    value={relationshipRole()}
                    placeholder="type"
                    onInput={(event) => setRelationshipRole(event.currentTarget.value)}
                    required
                  />
                  <div class={styles.formActions}>
                    <button type="button" class="kin-button" onClick={() => setIsAddingRelationship(false)}>cancel</button>
                    <button type="submit" class="kin-primary-button">save</button>
                  </div>
                </form>
              </Show>
            </section>

            <section class={styles.sidebarBlock}>
              <div class={styles.blockHeading}>
                <h2>Tags index</h2>
                <Show when={selectedTag()}><button type="button" class="kin-link-button" onClick={() => setSelectedTag(null)}>[ clear ]</button></Show>
              </div>
              <Show when={tags().length === 0}><p class={styles.blockEmpty}>No tags found in timeline logs.</p></Show>
              <div class={styles.tagList}>
                <For each={tags()}>{(tag) => (
                  <button type="button" classList={{ [styles.activeTag]: selectedTag() === tag }} onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}>
                    {selectedTag() === tag ? `[ #${tag} ]` : `#${tag}`}
                  </button>
                )}</For>
              </div>
            </section>
          </aside>

          <section class={styles.log} aria-label={`${person()!.name} timeline`}>
            <form class={styles.composer} onSubmit={addNote}>
              <label class="visually-hidden" for="new-note">Add timeline note</label>
              <textarea
                id="new-note"
                ref={noteInput}
                class="kin-textarea"
                value={noteBody()}
                placeholder="Enter interaction notes, observations, or updates here (use #tags to index)…"
                onInput={(event) => setNoteBody(event.currentTarget.value)}
                required
              />
              <button type="submit" class="kin-primary-button">add</button>
            </form>

            <Show when={visibleNotes().length === 0}><p class={styles.logEmpty}>{selectedTag() ? `No entries tagged #${selectedTag()}.` : "The timeline is empty."}</p></Show>
            <Show when={visibleNotes().length > 0}>
              <div class={styles.timeline}>
                <For each={visibleNotes()}>{(note) => (
                  <article class={styles.timelineItem} classList={{ [styles.pinned]: note.is_pinned === 1 }}>
                    <span class={styles.marker} aria-hidden="true" />
                    <div class={styles.timelineMeta}>
                      <div>
                        <time>{formatDate(note.created_at)}</time>
                        <button type="button" class="kin-link-button" onClick={() => void togglePinNote(note.id, note.is_pinned)}>
                          {note.is_pinned === 1 ? "[ unpin ]" : "[ pin ]"}
                        </button>
                      </div>
                      <button type="button" class="kin-link-button kin-danger-link" onClick={async () => { if (window.confirm("Delete this timeline entry?")) await deleteNote(note.id); }}>[ delete ]</button>
                    </div>
                    <p>{renderNote(note.body)}</p>
                  </article>
                )}</For>
                <span class={styles.eof}>~ EOF</span>
              </div>
            </Show>
          </section>
        </Show>
      </section>
    </main>
  );
}
