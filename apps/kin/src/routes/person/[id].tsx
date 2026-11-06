import { Button, ConfirmDialog, Dialog, Editor, Input, Popover, PopoverItem, Select, useVimKeymaps, type EditorHandle } from "@tildom/ui";
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import {
  findMarkdownTaskIndex,
  handleMarkdownishEnter,
  renderMarkdownishToHtml,
  toggleMarkdownTask,
} from "@tildom/markdownish";
import AppNav from "~/components/AppNav";
import { birthdayParts, birthdayValue, daysInBirthdayMonth, formatBirthday, type BirthdayParts } from "~/lib/birthday";
import PersonLoading from "./PersonLoading";
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
  isContactStoreReady,
  togglePinNote,
  updateContact,
  updateNote,
  type SymmetricalRelationship,
} from "~/stores/contactStore";
import type { Contact, Note } from "~/lib/db";
import styles from "./person.module.css";

const formatDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
}).format(timestamp);

const dateInputValue = (timestamp = Date.now()) => {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const dateInputTimestamp = (value: string, time = Date.now()) => {
  const date = new Date(`${value}T00:00:00`);
  const clock = new Date(time);
  date.setHours(clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds());
  return date.getTime();
};

const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2000, index)));

export default function PersonDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const routeSlug = () => params.slug ?? "";
  const contactId = () => person()?.id ?? "";
  const [person, setPerson] = createSignal<Contact | null>(null);
  const [notes, setNotes] = createSignal<Note[]>([]);
  const [relationships, setRelationships] = createSignal<SymmetricalRelationship[]>([]);
  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAddingRelationship, setIsAddingRelationship] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editRelationship, setEditRelationship] = createSignal("");
  const [editLocation, setEditLocation] = createSignal("");
  const [editBirthdayParts, setEditBirthdayParts] = createSignal<BirthdayParts>({ day: "", month: "", year: "" });
  const [editPhone, setEditPhone] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");
  const [relationshipRole, setRelationshipRole] = createSignal("");
  const [relationshipTarget, setRelationshipTarget] = createSignal("");
  const [noteBody, setNoteBody] = createSignal("");
  const [noteDate, setNoteDate] = createSignal(dateInputValue());
  const [editingNoteId, setEditingNoteId] = createSignal<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = createSignal("");
  const [editingNoteDate, setEditingNoteDate] = createSignal("");
  const [showDeletePersonConfirm, setShowDeletePersonConfirm] = createSignal(false);
  const [relationshipToDelete, setRelationshipToDelete] = createSignal<SymmetricalRelationship | null>(null);
  const [noteToDelete, setNoteToDelete] = createSignal<Note | null>(null);
  const [alertMessage, setAlertMessage] = createSignal<string | null>(null);
  let noteInput: EditorHandle | undefined;
  let composerForm: HTMLFormElement | undefined;

  const scrollComposerIntoView = () => {
    if (typeof window === "undefined") return;
    setTimeout(() => {
      composerForm?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, 150);
  };

  createEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onResize = () => {
      if (composerForm && composerForm.contains(document.activeElement)) {
        composerForm.scrollIntoView({ block: "end", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", onResize);
    onCleanup(() => vv.removeEventListener("resize", onResize));
  });

  const openPerson = async (id: string, replace = false) => navigate(await fetchContactPath(id), { replace });
  const [detail, { refetch }] = createResource(
    () => isContactStoreReady() ? routeSlug() : null,
    async (slug) => {
      const nextPerson = await fetchContactBySlug(slug);
      if (!nextPerson) return null;
      const [nextNotes, nextRelationships] = await Promise.all([
        fetchNotes(nextPerson.id),
        fetchRelationships(nextPerson.id),
      ]);
      return { person: nextPerson, notes: nextNotes, relationships: nextRelationships };
    },
  );
  const tags = () => [...new Set(notes().flatMap((note) => note.tags.trim().split(/\s+/).filter(Boolean)))].sort();
  const visibleNotes = () => selectedTag()
    ? notes().filter((note) => note.tags.includes(` ${selectedTag()} `))
    : notes();

  createEffect(() => {
    const next = detail();
    if (!next) {
      if (!detail.loading && isContactStoreReady() && !isSaving()) navigate("/");
      return;
    }
    setPerson(next.person);
    setEditName(next.person.name);
    setEditRelationship(next.person.relationship);
    setEditLocation(next.person.location);
    setEditBirthdayParts(birthdayParts(next.person.birthday));
    setEditPhone(next.person.phone);
    setEditEmail(next.person.email);
    setNotes(next.notes);
    setRelationships(next.relationships);
  });

  const removePerson = () => {
    setShowDeletePersonConfirm(true);
  };

  const confirmDeletePerson = async () => {
    const current = person();
    if (!current) return;
    setShowDeletePersonConfirm(false);
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
        name: editName(),
        relationship: editRelationship(),
        location: editLocation(),
        birthday: birthdayValue(editBirthdayParts()),
        phone: editPhone(),
        email: editEmail(),
      });
      setIsEditing(false);
      await refetch();
      await openPerson(contactId(), true);
    } catch { setAlertMessage("Failed to update person."); }
    finally { setIsSaving(false); }
  };

  const cancelEdit = () => {
    const current = person();
    if (current) {
      setEditName(current.name);
      setEditRelationship(current.relationship);
      setEditLocation(current.location);
      setEditBirthdayParts(birthdayParts(current.birthday));
      setEditPhone(current.phone);
      setEditEmail(current.email);
    }
    setIsEditing(false);
  };

  const updateBirthday = (part: keyof BirthdayParts, value: string) => {
    setEditBirthdayParts((prev) => {
      const next = { ...prev, [part]: value };
      if (Number(next.day) > daysInBirthdayMonth(next.month, next.year)) next.day = "";
      return next;
    });
  };

  const addNote = async (event: SubmitEvent) => {
    event.preventDefault();
    const body = noteBody().trim();
    if (!body) return;
    try {
      await createNote(contactId(), body, false, dateInputTimestamp(noteDate()));
      setNoteBody("");
      setNoteDate(dateInputValue());
      await refetch();
    } catch { setAlertMessage("Failed to save note."); }
  };

  const beginNoteEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditingNoteBody(note.body);
    setEditingNoteDate(dateInputValue(note.created_at));
  };

  const saveNote = async (event: SubmitEvent, note: Note) => {
    event.preventDefault();
    const body = editingNoteBody().trim();
    if (!body) return;
    const createdAt = editingNoteDate() ? dateInputTimestamp(editingNoteDate(), note.created_at) : note.created_at;
    try {
      await updateNote(note.id, body, note.is_pinned === 1, createdAt);
      setEditingNoteId(null);
      await refetch();
    } catch {
      setAlertMessage("Failed to update timeline entry.");
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
      await refetch();
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : "Failed to add relationship.");
    }
  };

  const removeRelationship = (relationship: SymmetricalRelationship) => {
    setRelationshipToDelete(relationship);
  };

  const confirmDeleteRelationship = async () => {
    const rel = relationshipToDelete();
    if (!rel) return;
    setRelationshipToDelete(null);
    await deleteRelationship(contactId(), rel.contactId);
    await refetch();
  };

  const pinNote = async (note: Note) => {
    await togglePinNote(note.id, note.is_pinned);
    await refetch();
  };

  const removeNote = (note: Note) => {
    setNoteToDelete(note);
  };

  const confirmDeleteNote = async () => {
    const note = noteToDelete();
    if (!note) return;
    setNoteToDelete(null);
    await deleteNote(note.id);
    await refetch();
  };

  const handleNoteClick = async (event: MouseEvent, note: Note) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    if (taskIndex !== null) {
      const body = toggleMarkdownTask(note.body, taskIndex);
      try {
        await updateNote(note.id, body, note.is_pinned === 1);
        await refetch();
      } catch {
        setAlertMessage("Failed to update task.");
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
        <Show when={person()} fallback={<PersonLoading />}>
          <Button variant="text"
            type="button"
            class={styles.mobileToggle}
            aria-expanded={detailsOpen()}
            onClick={() => setDetailsOpen(!detailsOpen())}
          >[{detailsOpen() ? "−" : "+"}] {detailsOpen() ? "hide" : "show"} personal details</Button>

          <aside class={styles.sidebar} classList={{ [styles.sidebarOpen]: detailsOpen() }}>
            <section class={styles.sidebarBlock}>
              <Show when={!isEditing()}>
                <div class={styles.profileHeading}>
                  <div>
                    <h1>{person()!.name}</h1>
                    <Show when={person()!.relationship}><span>[ {person()!.relationship} ]</span></Show>
                  </div>
                  <div class={styles.compactActions}>
                    <Button variant="text" type="button" class="kin-link-button" onClick={() => { setIsEditing(true); setDetailsOpen(true); }}>[ edit ]</Button>
                    <Button danger variant="text" type="button" class="kin-link-button kin-danger-link" onClick={removePerson}>[ delete ]</Button>
                  </div>
                </div>
                <dl class={styles.parameters}>
                  <Show when={person()!.location}><div><dt>Location</dt><dd>{person()!.location}</dd></div></Show>
                  <Show when={person()!.email}><div><dt>Email</dt><dd><a href={`mailto:${person()!.email}`}>{person()!.email}</a></dd></div></Show>
                  <Show when={person()!.phone}><div><dt>Phone</dt><dd><a href={`tel:${person()!.phone}`}>{person()!.phone}</a></dd></div></Show>
                  <Show when={person()!.birthday}><div><dt>Birthday</dt><dd>{formatBirthday(person()!.birthday)}</dd></div></Show>
                </dl>
              </Show>

              <Show when={isEditing()}>
                <form class={styles.editForm} onSubmit={savePerson}>
                  <h1>Edit profile</h1>
                  <label><span>Name</span><Input class="kin-input" value={editName()} onInput={(event) => setEditName(event.currentTarget.value)} required /></label>
                  <label><span>Relationship</span><Input class="kin-input" value={editRelationship()} placeholder="friend / family / colleague" onInput={(event) => setEditRelationship(event.currentTarget.value)} /></label>
                  <label><span>Location</span><Input class="kin-input" value={editLocation()} onInput={(event) => setEditLocation(event.currentTarget.value)} /></label>
                  <label><span>Email</span><Input class="kin-input" type="email" value={editEmail()} onInput={(event) => setEditEmail(event.currentTarget.value)} /></label>
                  <label><span>Phone</span><Input class="kin-input" type="tel" value={editPhone()} onInput={(event) => setEditPhone(event.currentTarget.value)} /></label>
                  <label>
                    <span>Birthday</span>
                    <div class={styles.birthdayPicker}>
                      <Select
                        class="kin-select"
                        aria-label="Birthday day"
                        value={editBirthdayParts().day}
                        onChange={(event) => updateBirthday("day", event.currentTarget.value)}
                      >
                        <option value="">day</option>
                        <For each={Array.from({ length: daysInBirthdayMonth(editBirthdayParts().month, editBirthdayParts().year) }, (_, index) => String(index + 1))}>
                          {(day) => <option value={day} selected={editBirthdayParts().day === day}>{day}</option>}
                        </For>
                      </Select>
                      <Select
                        class="kin-select"
                        aria-label="Birthday month"
                        value={editBirthdayParts().month}
                        onChange={(event) => updateBirthday("month", event.currentTarget.value)}
                      >
                        <option value="">month</option>
                        <For each={months}>
                          {(month, index) => <option value={String(index() + 1)} selected={editBirthdayParts().month === String(index() + 1)}>{month}</option>}
                        </For>
                      </Select>
                      <Input
                        class="kin-input"
                        aria-label="Birthday year"
                        inputMode="numeric"
                        maxLength="4"
                        pattern="[0-9]{4}"
                        value={editBirthdayParts().year}
                        placeholder="year"
                        onInput={(event) => updateBirthday("year", event.currentTarget.value.replace(/\D/g, "").slice(0, 4))}
                      />
                    </div>
                  </label>
                  <div class={styles.formActions}>
                    <Button type="submit" class="kin-primary-button" disabled={isSaving()}>{isSaving() ? "saving…" : "save"}</Button>
                    <Button type="button" class="kin-button" onClick={cancelEdit}>cancel</Button>
                  </div>
                </form>
              </Show>
            </section>

            <section class={styles.sidebarBlock}>
              <div class={styles.blockHeading}>
                <h2>Relationships</h2>
                <Show when={!isAddingRelationship() && contacts().length > 1}>
                  <Button variant="text" type="button" class="kin-link-button" onClick={() => { setIsAddingRelationship(true); setDetailsOpen(true); }}>[ add ]</Button>
                </Show>
              </div>
              <Show when={relationships().length === 0}><p class={styles.blockEmpty}>No relationships mapped.</p></Show>
              <ul class={styles.relationshipList}>
                <For each={relationships()}>{(relationship) => (
                  <li>
                    <Button variant="text" type="button" class={styles.relationshipLink} onClick={() => void openPerson(relationship.contactId)}>
                      <span>{relationship.roleLabel}:</span> {relationship.name}
                    </Button>
                    <Button danger variant="text"
                      type="button"
                      class="kin-link-button kin-danger-link"
                      aria-label={`Remove relationship with ${relationship.name}`}
                      onClick={() => void removeRelationship(relationship)}
                    >[×]</Button>
                  </li>
                )}</For>
              </ul>
              <Show when={isAddingRelationship()}>
                <form class={styles.relationshipForm} onSubmit={addRelationship}>
                  <Select class="kin-select" aria-label="Related person" value={relationshipTarget()} onChange={(event) => setRelationshipTarget(event.currentTarget.value)} required>
                    <option value="">target</option>
                    <For each={contacts().filter((contact) => contact.id !== contactId())}>{(contact) => <option value={contact.id}>{contact.name}</option>}</For>
                  </Select>
                  <Input
                    class="kin-input"
                    aria-label="Relationship type"
                    value={relationshipRole()}
                    placeholder="type"
                    onInput={(event) => setRelationshipRole(event.currentTarget.value)}
                    required
                  />
                  <div class={styles.formActions}>
                    <Button type="button" class="kin-button" onClick={() => setIsAddingRelationship(false)}>cancel</Button>
                    <Button type="submit" class="kin-primary-button">save</Button>
                  </div>
                </form>
              </Show>
            </section>

            <section class={styles.sidebarBlock}>
              <div class={styles.blockHeading}>
                <h2>Tags index</h2>
                <Show when={selectedTag()}><Button variant="text" type="button" class="kin-link-button" onClick={() => setSelectedTag(null)}>[ clear ]</Button></Show>
              </div>
              <Show when={tags().length === 0}><p class={styles.blockEmpty}>No tags found in timeline logs.</p></Show>
              <div class={styles.tagList}>
                <For each={tags()}>{(tag) => (
                  <Button variant="text" type="button" classList={{ [styles.activeTag]: selectedTag() === tag }} onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}>
                    {selectedTag() === tag ? `[ #${tag} ]` : `#${tag}`}
                  </Button>
                )}</For>
              </div>
            </section>
          </aside>

          <section class={styles.log} aria-label={`${person()!.name} timeline`}>
            <form
              ref={composerForm}
              class={styles.composer}
              onSubmit={addNote}
              onFocusIn={scrollComposerIntoView}
            >
              <label class="visually-hidden" for="new-note">Add timeline note</label>
              <Editor
                id="new-note"
                ref={(el) => {
                  noteInput = el;
                }}
                class="kin-textarea"
                value={noteBody()}
                placeholder="Enter interaction notes, observations, or updates here (use #tags to index)…"
                onInput={setNoteBody}
                onSubmit={() => void addNote(new Event("submit") as SubmitEvent)}
              />
              <div class={styles.composerActions}>
                <label class={styles.dateField}>
                  <span>on</span>
                  <Input type="date" value={noteDate()} onInput={(event) => setNoteDate(event.currentTarget.value)} required />
                </label>
                <Button type="submit" class="kin-primary-button">add entry</Button>
              </div>
            </form>

            <Show when={visibleNotes().length === 0}><p class={styles.logEmpty}>{selectedTag() ? `No entries tagged #${selectedTag()}.` : "The timeline is empty."}</p></Show>
            <Show when={visibleNotes().length > 0}>
              <div class={styles.timeline}>
                <For each={visibleNotes()}>{(note) => (
                  <article class={styles.timelineItem} classList={{ [styles.pinned]: note.is_pinned === 1 }}>
                    <span class={styles.marker} aria-hidden="true" />
                    <div class={styles.timelineMeta}>
                      <div class={styles.metaLead}>
                        <time class={styles.timelineDate}>{formatDate(note.created_at)}</time>
                        <Show when={note.is_pinned === 1}>
                          <span class={styles.pinnedLabel}>[ pinned ]</span>
                        </Show>
                      </div>
                      <div class={styles.menuAnchor}>
                        <Button
                          variant="text"
                          type="button"
                          class={styles.menuTrigger}
                          aria-label={`Actions for note from ${formatDate(note.created_at)}`}
                          popovertarget={`note-actions-${note.id}`}
                          style={{ "anchor-name": `--note-anchor-${note.id}` }}
                        >
                          [ ··· ]
                        </Button>
                        <Popover
                          id={`note-actions-${note.id}`}
                          anchorName={`--note-anchor-${note.id}`}
                          positionArea="bottom span-left"
                        >
                          <PopoverItem onClick={() => void pinNote(note)}>
                            {note.is_pinned === 1 ? "[ unpin ]" : "[ pin ]"}
                          </PopoverItem>
                          <PopoverItem onClick={() => beginNoteEdit(note)}>
                            [ edit ]
                          </PopoverItem>
                          <PopoverItem danger onClick={() => void removeNote(note)}>
                            [ delete ]
                          </PopoverItem>
                        </Popover>
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
                        <Editor
                          id={`note-edit-${note.id}`}
                          ariaLabel="Timeline entry"
                          value={editingNoteBody()}
                          autofocus
                          onInput={setEditingNoteBody}
                          onSubmit={() => void saveNote(new Event("submit") as SubmitEvent, note)}
                        />
                        <div class={styles.noteEditActions}>
                          <label class={styles.dateField}>
                            <span>on</span>
                            <Input
                              type="date"
                              value={editingNoteDate()}
                              aria-label="Timeline entry date"
                              onInput={(event) => setEditingNoteDate(event.currentTarget.value)}
                              required
                            />
                          </label>
                          <div class={styles.noteEditButtons}>
                            <Button type="submit" class="kin-primary-button">save</Button>
                            <Button variant="text" type="button" class="kin-link-button" onClick={() => setEditingNoteId(null)}>[ cancel ]</Button>
                          </div>
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

      <ConfirmDialog
        open={showDeletePersonConfirm()}
        title={`Delete ${person()?.name ?? "person"}?`}
        message={`Delete ${person()?.name ?? "this person"}? This also removes their notes and relationships.`}
        confirmText="delete"
        danger
        onConfirm={confirmDeletePerson}
        onCancel={() => setShowDeletePersonConfirm(false)}
      />

      <ConfirmDialog
        open={Boolean(relationshipToDelete())}
        title="Remove relationship?"
        message="Remove this relationship?"
        confirmText="remove"
        danger
        onConfirm={confirmDeleteRelationship}
        onCancel={() => setRelationshipToDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(noteToDelete())}
        title="Delete timeline entry?"
        message="Delete this timeline entry?"
        confirmText="delete"
        danger
        onConfirm={confirmDeleteNote}
        onCancel={() => setNoteToDelete(null)}
      />

      <Dialog
        open={Boolean(alertMessage())}
        onClose={() => setAlertMessage(null)}
        title="Notice"
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "1rem", padding: "0.5rem 0" }}>
          <p>{alertMessage()}</p>
          <div style={{ display: "flex", "justify-content": "flex-end" }}>
            <Button onClick={() => setAlertMessage(null)}>[ ok ]</Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
