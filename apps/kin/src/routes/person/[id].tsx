import { Show, For, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import AppNav from "~/components/AppNav";
import {
  fetchContact,
  fetchNotes,
  fetchRelationships,
  createNote,
  deleteNote,
  updateContact,
  deleteContact,
  createRelationship,
  deleteRelationship,
  ROLE_LABELS,
  contacts,
  togglePinNote,
  type Contact,
  type ContactNote,
  type SymmetricalRelationship
} from "~/stores/contactStore";
import { dbVersion } from "~/lib/db";
import {
  User,
  MapPin,
  Phone,
  Mail,
  Cake,
  Pin,
  Trash2,
  Check,
  X,
  Edit2,
  Share2
} from "lucide-solid";

export default function PersonDetail() {
  const params = useParams();
  const navigate = useNavigate();
  const contactId = () => params.id || "";

  const [selectedContact, setSelectedContact] = createSignal<Contact | null>(null);
  const [contactNotes, setContactNotes] = createSignal<ContactNote[]>([]);
  const [contactRelationships, setContactRelationships] = createSignal<SymmetricalRelationship[]>([]);

  const [selectedTag, setSelectedTag] = createSignal<string | null>(null);

  // Dynamic tags aggregator scanning all notes of this specific contact
  const uniqueTags = () => {
    const set = new Set<string>();
    contactNotes().forEach(note => {
      if (note.tags) {
        note.tags.trim().split(/\s+/).forEach(t => {
          if (t) set.add(t);
        });
      }
    });
    return Array.from(set).sort();
  };

  // Computed filtered list of notes
  const filteredNotes = () => {
    const tag = selectedTag();
    if (!tag) return contactNotes();
    return contactNotes().filter(note => note.tags.includes(` ${tag} `));
  };

  // Metadata editing buffers
  const [isEditingContact, setIsEditingContact] = createSignal(false);
  const [editName, setEditName] = createSignal("");
  const [editLocation, setEditLocation] = createSignal("");
  const [editBirthday, setEditBirthday] = createSignal("");
  const [editPhone, setEditPhone] = createSignal("");
  const [editEmail, setEditEmail] = createSignal("");

  // Adding relationship buffers
  const [isAddingRelationship, setIsAddingRelationship] = createSignal(false);
  const [relRole, setRelRole] = createSignal("friend");
  const [relTargetId, setRelTargetId] = createSignal("");

  // Note entry buffers
  const [newNoteBody, setNewNoteBody] = createSignal("");
  const [newNotePinned, setNewNotePinned] = createSignal(false);
  let noteTextareaRef!: HTMLTextAreaElement;

  // Reactively fetch contact details whenever id or dbVersion changes
  createEffect(async () => {
    const id = contactId();
    dbVersion(); // reactive bind

    if (id) {
      const c = await fetchContact(id);
      setSelectedContact(c);
      if (c) {
        setEditName(c.name);
        setEditLocation(c.location);
        setEditBirthday(c.birthday);
        setEditPhone(c.phone);
        setEditEmail(c.email);

        const notesList = await fetchNotes(id);
        setContactNotes(notesList);
        const relsList = await fetchRelationships(id);
        setContactRelationships(relsList);
      } else {
        // Contact not found
        navigate("/");
      }
    }
  });

  // Page Vim key bindings
  onMount(() => {
    let lastKey = "";
    const isVimEnabled = localStorage.getItem("vim-keybinds") !== "false";

    const handleKeyDown = (event: KeyboardEvent) => {
      const isDesktop = !("ontouchstart" in window) && window.innerWidth > 768;
      if (!isDesktop || !isVimEnabled) return;

      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");

      if (isTyping) {
        if (event.key === "Escape") {
          (activeEl as HTMLElement).blur();
          event.preventDefault();
        }
        return;
      }

      const key = event.key;

      // Esc: Go back to list page /
      if (key === "Escape") {
        event.preventDefault();
        navigate("/");
        return;
      }

      // Buffer Tab Shifts
      if (lastKey === "g" && (key === "t" || key === "T")) {
        event.preventDefault();
        lastKey = "";
        navigate("/settings");
        return;
      }
      if (key === "g") {
        lastKey = "g";
        setTimeout(() => { if (lastKey === "g") lastKey = ""; }, 1000);
      }

      // Focus note input: i
      if (key === "i") {
        event.preventDefault();
        if (noteTextareaRef) noteTextareaRef.focus();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleUpdateContactMetadata = async (e: Event) => {
    e.preventDefault();
    const id = contactId();
    if (!id) return;

    try {
      await updateContact(id, {
        name: editName(),
        location: editLocation(),
        birthday: editBirthday(),
        phone: editPhone(),
        email: editEmail(),
      });
      setIsEditingContact(false);
    } catch (err) {
      alert("Failed to update contact.");
    }
  };

  const handleDeleteContact = async () => {
    const confirmDelete = window.confirm("Delete this person? This will remove all note and connection records permanently.");
    if (!confirmDelete) return;

    await deleteContact(contactId());
    navigate("/");
  };

  const handleAddNote = async (e: Event) => {
    e.preventDefault();
    const body = newNoteBody().trim();
    if (!body) return;

    try {
      await createNote(contactId(), body, newNotePinned());
      setNewNoteBody("");
      setNewNotePinned(false);
    } catch (err) {
      alert("Failed to save note.");
    }
  };

  const handleTogglePin = async (noteId: string, currentIsPinned: number) => {
    try {
      await togglePinNote(noteId, currentIsPinned);
    } catch (err) {
      alert("Failed to toggle pinned status.");
    }
  };

  const handleAddRelationship = async (e: Event) => {
    e.preventDefault();
    const currentId = contactId();
    const targetId = relTargetId();
    const role = relRole();
    if (!currentId || !targetId || !role) return;

    try {
      await createRelationship(currentId, targetId, role);
      setIsAddingRelationship(false);
      setRelTargetId("");
    } catch (err: any) {
      alert(err.message || "Failed to add relationship.");
    }
  };

  const handleDeleteRelationship = async (relatedId: string) => {
    const currentId = contactId();
    const confirmDel = window.confirm("Remove this connection record?");
    if (!confirmDel) return;

    await deleteRelationship(currentId, relatedId);
  };

  const renderNoteBody = (body: string) => {
    const parts = body.split(/(#[a-zA-Z0-9_-]+)/g);
    return (
      <>
        {parts.map(part => {
          if (part.startsWith("#")) {
            const rawTag = part.slice(1).toLowerCase();
            return (
              <span
                class="tui-tag"
                onClick={() => {
                  setSelectedTag(selectedTag() === rawTag ? null : rawTag);
                }}
              >
                {part}
              </span>
            );
          }
          return part;
        })}
      </>
    );
  };

  return (
    <div class="tui-page">
      <AppNav active="people" />

      <main class="tui-content">
        <Show when={!selectedContact()}>
          <div class="tui-empty">
            <span class="vim-cursor">█</span> Loading Contact Details...
          </div>
        </Show>

        <Show when={selectedContact()}>
          {/* Header buffer */}
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.75rem;">
            <div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 900;">{selectedContact()!.name}</h1>
              <Show when={selectedContact()!.location}>
                <span class="tui-muted" style="font-size: 13px; display: inline-flex; align-items: center; gap: 0.5ch; margin-top: 0.25rem;">
                  <MapPin size={12} /> {selectedContact()!.location}
                </span>
              </Show>
            </div>

            <div style="display: flex; gap: 1.5ch;">
              <button
                class="tui-btn"
                style="min-height: 38px; padding: 0 2ch;"
                onClick={() => {
                  setIsEditingContact(!isEditingContact());
                  setIsAddingRelationship(false);
                }}
              >
                <Edit2 size={13} style="margin-right: 0.5ch;" />
                {isEditingContact() ? "Cancel" : "Edit Details"}
              </button>
              <button
                class="tui-btn tui-btn-danger"
                style="min-height: 38px; padding: 0 1.5ch;"
                onClick={handleDeleteContact}
                aria-label="Delete Contact"
              >
                <Trash2 size={13} />
              </button>
              <button
                class="tui-btn"
                style="min-height: 38px; padding: 0 1.5ch;"
                onClick={() => navigate("/")}
                aria-label="Go back to list"
              >
                [ esc: back ]
              </button>
            </div>
          </div>

          <div class="tui-split-pane">
            {/* Left Pane: Key Details & Connections */}
            <div class="tui-stack" style="display: flex; flex-direction: column; gap: 1.5rem;">
              
              {/* Demographics details */}
              <div class="tui-panel">
                <h3 class="tui-panel-heading">Key Parameters</h3>

                <Show when={!isEditingContact()}>
                  <div class="tui-meta-list">
                    <div class="tui-meta-item">
                      <span class="tui-meta-label">📍 LOCATION:</span>
                      <span class="tui-meta-value">{selectedContact()!.location || "—"}</span>
                    </div>
                    <div class="tui-meta-item">
                      <span class="tui-meta-label">✉ EMAIL:</span>
                      <span class="tui-meta-value">{selectedContact()!.email || "—"}</span>
                    </div>
                    <div class="tui-meta-item">
                      <span class="tui-meta-label">📞 PHONE:</span>
                      <span class="tui-meta-value">{selectedContact()!.phone || "—"}</span>
                    </div>
                    <div class="tui-meta-item">
                      <span class="tui-meta-label">🎂 BIRTHDAY:</span>
                      <span class="tui-meta-value">{selectedContact()!.birthday || "—"}</span>
                    </div>
                  </div>
                </Show>

                <Show when={isEditingContact()}>
                  <form onSubmit={handleUpdateContactMetadata} class="tui-stack">
                    <div class="tui-form-row">
                      <label class="tui-label">Name</label>
                      <input type="text" class="tui-input" value={editName()} onInput={(e) => setEditName(e.currentTarget.value)} required />
                    </div>
                    <div class="tui-form-row">
                      <label class="tui-label">Location</label>
                      <input type="text" class="tui-input" value={editLocation()} onInput={(e) => setEditLocation(e.currentTarget.value)} />
                    </div>
                    <div class="tui-form-row">
                      <label class="tui-label">Email</label>
                      <input type="email" class="tui-input" value={editEmail()} onInput={(e) => setEditEmail(e.currentTarget.value)} />
                    </div>
                    <div class="tui-form-row">
                      <label class="tui-label">Phone</label>
                      <input type="text" class="tui-input" value={editPhone()} onInput={(e) => setEditPhone(e.currentTarget.value)} />
                    </div>
                    <div class="tui-form-row">
                      <label class="tui-label">Birthday</label>
                      <input type="text" class="tui-input" placeholder="e.g. November 20" value={editBirthday()} onInput={(e) => setEditBirthday(e.currentTarget.value)} />
                    </div>
                    <div class="tui-row-actions">
                      <button type="submit" class="tui-btn"><Check size={14} style="margin-right: 0.5ch;" /> Save</button>
                      <button type="button" class="tui-btn tui-btn-danger" onClick={() => setIsEditingContact(false)}>Cancel</button>
                    </div>
                  </form>
                </Show>
              </div>

              {/* Bidirectional Relationships */}
              <div class="tui-panel">
                <h3 class="tui-panel-heading">Relationships</h3>

                <Show when={contactRelationships().length === 0}>
                  <p class="tui-muted" style="font-size: 13px; margin: 0 0 1rem 0;">No connection records defined.</p>
                </Show>

                <Show when={contactRelationships().length > 0}>
                  <div class="tui-relationship-list">
                    <For each={contactRelationships()}>
                      {(rel) => (
                        <div class="tui-relationship-item">
                          <div>
                            <span
                              class="tui-relationship-name"
                              style="color: var(--highlight-blue); cursor: pointer; text-decoration: underline;"
                              onClick={() => navigate(`/person/${rel.contactId}`)}
                            >
                              {rel.name}
                            </span>
                            <span class="tui-relationship-label">({rel.roleLabel})</span>
                          </div>
                          <span class="tui-relationship-delete" onClick={() => handleDeleteRelationship(rel.contactId)}>
                            [X]
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Add relationship inline trigger */}
                <Show when={!isAddingRelationship() && contacts().length > 1}>
                  <div class="tui-inline-trigger" style="min-height: 32px;" onClick={() => setIsAddingRelationship(true)}>
                    <Share2 size={12} style="margin-right: 0.5ch;" /> [+] Define Connection
                  </div>
                </Show>

                <Show when={isAddingRelationship()}>
                  <form onSubmit={handleAddRelationship} class="tui-inline-add" style="margin-top: 0.5rem;">
                    <div class="tui-form-row">
                      <label class="tui-label">Related Contact</label>
                      <select
                        class="tui-select"
                        value={relTargetId()}
                        onChange={(e) => setRelTargetId(e.currentTarget.value)}
                        required
                      >
                        <option value="">-- Choose Person --</option>
                        <For each={contacts().filter(c => c.id !== contactId())}>
                          {(c) => <option value={c.id}>{c.name}</option>}
                        </For>
                      </select>
                    </div>

                    <div class="tui-form-row">
                      <label class="tui-label">Relation Role</label>
                      <select
                        class="tui-select"
                        value={relRole()}
                        onChange={(e) => setRelRole(e.currentTarget.value)}
                      >
                        <option value="friend">Friend</option>
                        <option value="spouse">Spouse</option>
                        <option value="parent">Parent of this Contact (Symmetrical)</option>
                        <option value="child">Child of this Contact (Symmetrical)</option>
                        <option value="sibling">Sibling</option>
                        <option value="partner">Partner</option>
                        <option value="colleague">Colleague</option>
                        <option value="mentor">Mentor</option>
                        <option value="mentee">Mentee</option>
                      </select>
                    </div>

                    <div class="tui-row-actions">
                      <button type="submit" class="tui-btn" style="min-height: 36px; padding: 0 2ch;">Add</button>
                      <button type="button" class="tui-btn tui-btn-danger" style="min-height: 36px; padding: 0 1.5ch;" onClick={() => setIsAddingRelationship(false)}>Cancel</button>
                    </div>
                  </form>
                </Show>
              </div>

              {/* Timeline Tags Filter Panel */}
              <div class="tui-panel">
                <h3 class="tui-panel-heading">Tags Index</h3>
                <Show when={uniqueTags().length === 0}>
                  <p class="tui-muted" style="font-size: 13px; margin: 0;">No tags registered in notes.</p>
                </Show>
                <Show when={uniqueTags().length > 0}>
                  <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <For each={uniqueTags()}>
                      {(tag) => (
                        <button
                          style="display: flex; align-items: center; text-align: left; cursor: pointer; border: none; background: transparent; padding: 4px 8px; font-family: inherit; font-size: 13px; font-weight: bold; width: 100%; transition: all 0.1s;"
                          classList={{ "tui-tag": tag === selectedTag(), "tui-muted": tag !== selectedTag() }}
                          onClick={() => setSelectedTag(selectedTag() === tag ? null : tag)}
                        >
                          <span style="margin-right: 0.5ch;">{selectedTag() === tag ? "[x]" : "[ ]"}</span>
                          <span>#{tag}</span>
                        </button>
                      )}
                    </For>
                    <Show when={selectedTag()}>
                      <button
                        class="tui-btn"
                        style="margin-top: 0.5rem; min-height: 32px; padding: 0 1.5ch; font-size: 11px;"
                        onClick={() => setSelectedTag(null)}
                      >
                        [ Clear Filter ]
                      </button>
                    </Show>
                  </div>
                </Show>
              </div>
            </div>

            {/* Right Pane: Unified Timeline Notes Feed */}
            <div class="tui-stack" style="display: flex; flex-direction: column; gap: 1.5rem;">
              
              <div class="tui-panel" style="padding-bottom: 1.5rem;">
                <h3 class="tui-panel-heading">Timeline Feed</h3>

                {/* Add Timeline Note */}
                <form onSubmit={handleAddNote} style="margin-bottom: 2rem;">
                  <div class="tui-form-row">
                    <label class="tui-label">Log Note</label>
                    <textarea
                      ref={noteTextareaRef}
                      class="tui-textarea"
                      placeholder="Log an interaction, milestone, or notes... Use #tags to index."
                      value={newNoteBody()}
                      onInput={(e) => setNewNoteBody(e.currentTarget.value)}
                      required
                    />
                  </div>

                  <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem;">
                    <label style="display: inline-flex; align-items: center; gap: 1ch; cursor: pointer; user-select: none; font-weight: bold; font-size: 13px;">
                      <input
                        type="checkbox"
                        checked={newNotePinned()}
                        onChange={(e) => setNewNotePinned(e.currentTarget.checked)}
                        style="display: none;"
                      />
                      <span>{newNotePinned() ? "[x]" : "[ ]"} PIN NOTE TO TOP</span>
                    </label>

                    <button type="submit" class="tui-btn" style="min-height: 38px;">
                      Save Timeline Entry
                    </button>
                  </div>
                </form>

                {/* Timeline display stream */}
                <Show when={filteredNotes().length === 0}>
                  <div class="tui-empty">
                    {selectedTag()
                      ? `No notes in the timeline match the tag #${selectedTag()}.`
                      : "Timeline stream is empty. Add a note to record personal updates."}
                  </div>
                </Show>

                <Show when={filteredNotes().length > 0}>
                  <div class="tui-feed">
                    <For each={filteredNotes()}>
                      {(note) => (
                        <div
                          class="tui-feed-item"
                          classList={{ "pinned-note": note.is_pinned === 1 }}
                        >
                          <div class="tui-feed-item-header">
                            <span style="font-weight: 500;">{new Date(note.created_at).toLocaleString()}</span>
                            <div style="display: flex; gap: 1.5ch; align-items: center;">
                              <Show when={note.is_pinned === 1}>
                                <span class="tui-feed-pin-badge">PINNED</span>
                              </Show>
                              <button
                                style="color: var(--highlight-blue); font-size: 10px; font-weight: bold; cursor: pointer; border: none; background: transparent; padding: 2px; font-family: inherit;"
                                onClick={() => handleTogglePin(note.id, note.is_pinned)}
                              >
                                {note.is_pinned === 1 ? "[UNPIN]" : "[PIN]"}
                              </button>
                              <button
                                style="color: var(--syntax-error); font-size: 10px; font-weight: bold; cursor: pointer; border: none; background: transparent; padding: 2px; font-family: inherit;"
                                onClick={async () => {
                                  if (window.confirm("Remove this entry from the timeline?")) {
                                    await deleteNote(note.id);
                                  }
                                }}
                              >
                                [DELETE]
                              </button>
                            </div>
                          </div>
                          <div class="tui-feed-body">
                            {renderNoteBody(note.body)}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>

            </div>
          </div>
        </Show>
      </main>
    </div>
  );
}
