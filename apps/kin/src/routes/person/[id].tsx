import { For, Show, createEffect, createSignal } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import {
  findMarkdownTaskIndex,
  handleMarkdownishEnter,
  renderMarkdownishToHtml,
  toggleMarkdownTask,
} from "@tildom/markdownish";
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
  updateNote,
  type Contact,
  type ContactNote,
  type SymmetricalRelationship,
} from "~/stores/contactStore";
import styles from "./person.module.css";

const formatDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
}).format(timestamp);

const dateInputValue = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const dateInputTimestamp = (value: string) => new Date(`${value}T12:00:00`).getTime();

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
  const [noteDate, setNoteDate] = createSignal(dateInputValue());
  const [editingNoteId, setEditingNoteId] = createSignal<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = createSignal("");
  const [editingDateNoteId, setEditingDateNoteId] = createSignal<string | null>(null);
  const [editingNoteDate, setEditingNoteDate] = createSignal("");
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
      await createNote(contactId(), body, false, dateInputTimestamp(noteDate()));
      setNoteBody("");
      setNoteDate(dateInputValue());
    } catch { window.alert("Failed to save note."); }
  };

  const beginNoteEdit = (note: ContactNote) => {
    setEditingNoteId(note.id);
    setEditingNoteBody(note.body);
  };

  const saveNote = async (event: SubmitEvent, note: ContactNote) => {
    event.preventDefault();
    const body = editingNoteBody().trim();
    if (!body) return;
    try {
      await updateNote(note.id, body, note.is_pinned === 1);
      setEditingNoteId(null);
    } catch {
      window.alert("Failed to update timeline entry.");
    }
  };

  const saveNoteDate = async (note: ContactNote, value: string) => {
    const createdAt = dateInputTimestamp(value);
    try {
      await updateNote(note.id, note.body, note.is_pinned === 1, createdAt);
      setNotes(current => current.map(item => item.id === note.id ? { ...item, created_at: createdAt } : item));
      setEditingDateNoteId(null);
    } catch {
      window.alert("Failed to update timeline date.");
    }
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

  const handleNoteClick = async (event: MouseEvent, note: ContactNote) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    if (taskIndex !== null) {
      const body = toggleMarkdownTask(note.body, taskIndex);
      try {
        await updateNote(note.id, body, note.is_pinned === 1);
        setNotes(current => current.map(item => item.id === note.id ? { ...item, body } : item));
      } catch {
        window.alert("Failed to update task.");
      }
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-markdownish-tag]");
    const container = event.currentTarget;
    if (!(container instanceof HTMLElement) || !button || !container.contains(button)) return;
    const tag = button.dataset.markdownishTag?.toLowerCase();
    if (tag) setSelectedTag(selectedTag() === tag ? null : tag);
  };

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
                onKeyDown={handleMarkdownishEnter}
                required
              />
              <div class={styles.composerActions}>
                <label class={styles.dateField}>
                  <span>on</span>
                  <input type="date" value={noteDate()} onInput={(event) => setNoteDate(event.currentTarget.value)} required />
                </label>
                <button type="submit" class="kin-primary-button">add entry</button>
              </div>
            </form>

            <Show when={visibleNotes().length === 0}><p class={styles.logEmpty}>{selectedTag() ? `No entries tagged #${selectedTag()}.` : "The timeline is empty."}</p></Show>
            <Show when={visibleNotes().length > 0}>
              <div class={styles.timeline}>
                <For each={visibleNotes()}>{(note) => (
                  <article class={styles.timelineItem} classList={{ [styles.pinned]: note.is_pinned === 1 }}>
                    <span class={styles.marker} aria-hidden="true" />
                    <div class={styles.timelineMeta}>
                      <div>
                        <Show when={editingDateNoteId() === note.id} fallback={(
                          <button
                            type="button"
                            class={styles.timelineDate}
                            title="Edit date"
                            aria-label={`Edit date: ${formatDate(note.created_at)}`}
                            onClick={() => {
                              setEditingDateNoteId(note.id);
                              setEditingNoteDate(dateInputValue(note.created_at));
                            }}
                          >{formatDate(note.created_at)}</button>
                        )}>
                          <input
                            class={styles.timelineDateInput}
                            type="date"
                            value={editingNoteDate()}
                            aria-label="Timeline entry date"
                            autofocus
                            onInput={(event) => {
                              setEditingNoteDate(event.currentTarget.value);
                              if (event.currentTarget.value) void saveNoteDate(note, event.currentTarget.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setEditingDateNoteId(null);
                            }}
                          />
                        </Show>
                        <button type="button" class="kin-link-button" onClick={() => void togglePinNote(note.id, note.is_pinned)}>
                          {note.is_pinned === 1 ? "[ unpin ]" : "[ pin ]"}
                        </button>
                      </div>
                      <div>
                        <button type="button" class="kin-link-button" onClick={() => beginNoteEdit(note)}>[ edit ]</button>
                        <button type="button" class="kin-link-button kin-danger-link" onClick={async () => { if (window.confirm("Delete this timeline entry?")) await deleteNote(note.id); }}>[ delete ]</button>
                      </div>
                    </div>
                    <Show when={editingNoteId() === note.id} fallback={(
                      <div
                        class={`${styles.noteBody} markdownish`}
                        innerHTML={renderMarkdownishToHtml(note.body, { hashtags: true, tasks: true })}
                        onClick={(event) => void handleNoteClick(event, note)}
                      />
                    )}>
                      <form class={styles.noteEditForm} onSubmit={(event) => void saveNote(event, note)}>
                        <textarea
                          class="kin-textarea"
                          aria-label="Timeline entry"
                          value={editingNoteBody()}
                          autofocus
                          onInput={(event) => setEditingNoteBody(event.currentTarget.value)}
                          onKeyDown={handleMarkdownishEnter}
                          required
                        />
                        <div class={styles.noteEditActions}>
                          <button type="submit" class="kin-primary-button">save</button>
                          <button type="button" class="kin-link-button" onClick={() => setEditingNoteId(null)}>[ cancel ]</button>
                        </div>
                      </form>
                    </Show>
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
