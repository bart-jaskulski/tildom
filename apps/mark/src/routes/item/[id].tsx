import { Title } from "@solidjs/meta";
import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import {
  findMarkdownTaskIndex,
  renderMarkdownishToHtml,
  toggleMarkdownTask,
} from "@tildom/markdownish";
import { Button, Editor, TextButton, useVimKeymaps } from "@tildom/ui";
import ItemLoading from "~/components/ItemLoading";
import { formatRelativeTimestamp, splitNoteIntoTitleAndBody } from "~/lib/entries";
import { parseHashTags } from "~/lib/tags";
import { addCommentToEntry, deleteComment, deleteEntry, fetchEntryDetail, isEntryStoreReady, recordEntryOpen, updateComment, updateEntry } from "~/stores/entryStore";
import styles from "./[id].module.css";

const bodyWithMissingTags = (entry: { body: string; tags: string[] }) => {
  const inlineTags = new Set(parseHashTags(entry.body));
  const missingTags = entry.tags.filter((tag) => !inlineTags.has(tag));
  return [entry.body, missingTags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n");
};

const collapseTrailingTags = (content: string) => {
  const lines = content.split("\n");
  const tags: string[] = [];

  while (lines.length > 0) {
    const line = lines.at(-1)!.trim();
    if (!line && tags.length > 0) {
      lines.pop();
      continue;
    }
    if (!/^#[a-z0-9_-]+(?:\s+#[a-z0-9_-]+)*$/i.test(line)) break;
    tags.unshift(...line.split(/\s+/));
    lines.pop();
  }

  return tags.length > 0
    ? [lines.join("\n").trimEnd(), tags.join(" ")].filter(Boolean).join("\n\n")
    : content;
};

export default function ItemPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [commentBody, setCommentBody] = createSignal("");
  const [editMemo, setEditMemo] = createSignal("");
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [commentError, setCommentError] = createSignal<string | null>(null);
  const [commentActionError, setCommentActionError] = createSignal<string | null>(null);
  const [isEditSaving, setIsEditSaving] = createSignal(false);
  const [isCommentSaving, setIsCommentSaving] = createSignal(false);
  const [editingCommentId, setEditingCommentId] = createSignal<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = createSignal("");
  const [commentSavingId, setCommentSavingId] = createSignal<string | null>(null);
  const [commentDeletingId, setCommentDeletingId] = createSignal<string | null>(null);
  const [isEditing, setIsEditing] = createSignal(false);
  const [isDeleting, setIsDeleting] = createSignal(false);
  const [detail, { mutate }] = createResource(
    () => (!isServer && isEntryStoreReady() ? params.id ?? null : null),
    (entryId) => fetchEntryDetail(entryId),
  );
  const entry = () => detail()?.entry ?? null;
  let openedEntryId: string | undefined;
  createEffect(() => {
    const currentEntry = entry();
    if (!currentEntry || currentEntry.id === openedEntryId) return;

    openedEntryId = currentEntry.id;
    void recordEntryOpen(currentEntry.id).then((opened) => {
      mutate((current) => current?.entry?.id === currentEntry.id ? {
        ...current,
        entry: { ...current.entry, ...opened },
      } : current);
    });
  });
  useVimKeymaps([
    { lhs: "i", callback: () => startEditing(), help: "edit entry" },
    { lhs: ["o", "gx"], callback: () => {
      const currentEntry = entry();
      if (currentEntry?.canonicalUrl) {
        void recordEntryOpen(currentEntry.id);
        window.open(currentEntry.canonicalUrl, "_blank", "noreferrer");
      }
    }, help: "open original URL" },
    { lhs: "d", callback: () => void handleDelete(), help: "delete entry" },
  ]);

  const startEditing = () => {
    const currentEntry = entry();
    if (!currentEntry) {
      return;
    }

    if (currentEntry.canonicalUrl) {
      // For bookmarks: edit body and tags; title and canonicalUrl remain in header
      const content = collapseTrailingTags(currentEntry.body.replace(/^\n/, ""));
      const existingTags = new Set(parseHashTags(content));
      const missingTags = currentEntry.tags.filter((tag) => !existingTags.has(tag));
      setEditMemo([content, missingTags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n"));
    } else {
      // For notes: title is line 1, body is line 2+
      const content = collapseTrailingTags(currentEntry.body.replace(/^\n/, ""));
      const existingTags = new Set(parseHashTags(`${currentEntry.title}\n${content}`));
      const missingTags = currentEntry.tags.filter((tag) => !existingTags.has(tag));
      setEditMemo([currentEntry.title, content, missingTags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n"));
    }
    setActionError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setActionError(null);
  };

  const submitEdit = async (event: SubmitEvent) => {
    event.preventDefault();
    const currentEntry = entry();
    if (!currentEntry) {
      return;
    }

    setIsEditSaving(true);
    setActionError(null);

    try {
      let title = currentEntry.title;
      let body = editMemo();

      if (!currentEntry.canonicalUrl) {
        const memo = splitNoteIntoTitleAndBody(editMemo());
        title = memo.title;
        body = memo.body;
      }

      const updatedEntry = await updateEntry(currentEntry.id, {
        title,
        content: body,
        tags: parseHashTags(editMemo()).join(" "),
      });
      setIsEditing(false);
      mutate((current) => current?.entry ? {
        ...current,
        entry: {
          ...current.entry,
          ...updatedEntry,
          tags: updatedEntry.tags ?? current.entry.tags,
        },
      } : current);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update entry");
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleDelete = async () => {
    const currentEntry = entry();
    if (!currentEntry || !window.confirm("Delete this entry?")) {
      return;
    }

    setIsDeleting(true);
    setActionError(null);

    try {
      await deleteEntry(currentEntry.id);
      navigate("/", { replace: true });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setIsDeleting(false);
    }
  };

  const submitComment = async (event: SubmitEvent) => {
    event.preventDefault();
    const currentEntry = entry();
    if (!currentEntry) {
      return;
    }

    setIsCommentSaving(true);
    setCommentError(null);

    try {
      const comment = await addCommentToEntry(currentEntry.id, commentBody());
      setCommentBody("");
      mutate((current) => current?.entry ? {
        ...current,
        entry: {
          ...current.entry,
          updatedAt: comment.updatedAt,
          lastCommentedAt: comment.createdAt,
          commentCount: current.entry.commentCount + 1,
        },
        comments: [...current.comments, comment],
      } : current);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setIsCommentSaving(false);
    }
  };

  const startCommentEditing = (commentId: string, body: string) => {
    setEditingCommentId(commentId);
    setEditingCommentBody(body);
    setCommentActionError(null);
  };

  const cancelCommentEditing = () => {
    setEditingCommentId(null);
    setEditingCommentBody("");
    setCommentActionError(null);
  };

  const submitCommentEdit = async (event: SubmitEvent, commentId: string) => {
    event.preventDefault();
    setCommentSavingId(commentId);
    setCommentActionError(null);

    try {
      const updatedComment = await updateComment(commentId, editingCommentBody());
      cancelCommentEditing();
      mutate((current) => current ? {
        ...current,
        comments: current.comments.map((comment) => comment.id === commentId ? {
          ...comment,
          ...updatedComment,
        } : comment),
      } : current);
    } catch (err) {
      setCommentActionError(err instanceof Error ? err.message : "Failed to update note");
    } finally {
      setCommentSavingId(null);
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!window.confirm("Delete this note?")) {
      return;
    }

    setCommentDeletingId(commentId);
    setCommentActionError(null);

    try {
      await deleteComment(commentId);
      if (editingCommentId() === commentId) {
        cancelCommentEditing();
      }
      mutate((current) => current?.entry ? {
        ...current,
        entry: {
          ...current.entry,
          commentCount: Math.max(0, current.entry.commentCount - 1),
        },
        comments: current.comments.filter((comment) => comment.id !== commentId),
      } : current);
    } catch (err) {
      setCommentActionError(err instanceof Error ? err.message : "Failed to delete note");
    } finally {
      setCommentDeletingId(null);
    }
  };

  const handleEntryTaskClick = async (event: MouseEvent) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    const currentEntry = entry();
    if (taskIndex === null || !currentEntry) return;

    try {
      const updatedEntry = await updateEntry(currentEntry.id, {
        title: currentEntry.title,
        content: toggleMarkdownTask(currentEntry.body, taskIndex),
        tags: currentEntry.tags.join(" "),
      });
      mutate((current) => current?.entry ? {
        ...current,
        entry: {
          ...current.entry,
          ...updatedEntry,
          tags: updatedEntry.tags ?? current.entry.tags,
        },
      } : current);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update task");
    }
  };

  const handleEntryTagClick = (event: MouseEvent) => {
    const tag = event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>("a.markdownish-tag")?.textContent?.slice(1)
      : undefined;
    if (!tag) return;
    event.preventDefault();
    navigate(`/?q=${encodeURIComponent(`#${tag}`)}`);
  };

  const readingTime = () => Math.max(1, Math.ceil((entry()?.readerTextLength ?? 0) / 1_000));

  const handleCommentTaskClick = async (event: MouseEvent, commentId: string, body: string) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    if (taskIndex === null) return;

    try {
      const updatedComment = await updateComment(commentId, toggleMarkdownTask(body, taskIndex));
      mutate((current) => current ? {
        ...current,
        comments: current.comments.map((comment) => comment.id === commentId ? {
          ...comment,
          ...updatedComment,
        } : comment),
      } : current);
    } catch (error) {
      setCommentActionError(error instanceof Error ? error.message : "Failed to update task");
    }
  };

  return (
    <>
      <Title>{entry()?.title ? `${entry()!.title} | mark.tildom` : "Item | mark.tildom"}</Title>
        <Show when={entry()} fallback={
          !isEntryStoreReady() || detail.loading
            ? <ItemLoading />
            : <p class="hn-status">Item not found</p>
        }>
          {(currentEntry) => (
            <>
              <article>
                <div class={styles.subtext}>
                  <Show when={currentEntry().domain}>
                    <span>({currentEntry().domain})</span>
                  </Show>
                  <Show when={currentEntry().readerTextLength > 0}>
                    <span>≈{readingTime()}m</span>
                  </Show>
                </div>
                <div class={styles.entryActions}>
                  <Show when={!isEditing()} fallback={
                    <>
                      <TextButton
                        type="button"
                        inline
                        onClick={() => void submitEdit(new Event("submit") as SubmitEvent)}
                        disabled={isEditSaving()}
                      >
                        {isEditSaving() ? "saving..." : "save"}
                      </TextButton>
                      <span aria-hidden="true">|</span>
                      <TextButton type="button" inline onClick={cancelEditing}>
                        cancel
                      </TextButton>
                    </>
                  }>
                    <TextButton type="button" inline onClick={startEditing}>
                      edit
                    </TextButton>
                    <Show when={currentEntry().canonicalUrl}>
                      <span aria-hidden="true">|</span>
                      <A href={`/item/${currentEntry().id}/read`}>read</A>
                    </Show>
                    <span aria-hidden="true">|</span>
                    <TextButton
                      type="button"
                      inline
                      onClick={handleDelete}
                      disabled={isDeleting()}
                    >
                      {isDeleting() ? "deleting..." : "delete"}
                    </TextButton>
                  </Show>
                </div>

                <Show when={currentEntry().canonicalUrl}>
                  <h1 class={styles.title}>{currentEntry().title}</h1>

                  <a
                    href={currentEntry().canonicalUrl!}
                    target="_blank"
                    rel="noreferrer"
                    class={`${styles.url} ${styles.subtext}`}
                    onClick={() => void recordEntryOpen(currentEntry().id)}
                  >
                    {currentEntry().canonicalUrl}
                  </a>

                  <Show when={currentEntry().excerpt}>
                    <p class={styles.preview}>{currentEntry().excerpt}</p>
                  </Show>
                </Show>

                <Show when={!isEditing()} fallback={
                  <form class={`${styles.memoForm} item-edit-form`} onSubmit={submitEdit}>
                    <span id="edit-memo-label" class="visually-hidden">edit entry</span>
                    <Editor
                      id="edit-memo"
                      ariaLabelledby="edit-memo-label"
                      value={editMemo()}
                      onInput={setEditMemo}
                      onSubmit={() => void submitEdit(new Event("submit") as SubmitEvent)}
                      placeholder={currentEntry().canonicalUrl ? "Write a note on this link… #tag" : "Title\nWrite your note… #tag"}
                      titleFirstLine={!currentEntry().canonicalUrl}
                      variant="borderless"
                      autofocus
                    />

                    <Show when={actionError()}>
                      <p class="hn-error">{actionError()}</p>
                    </Show>
                  </form>
                }>
                  <Show when={!currentEntry().canonicalUrl}>
                    <h1 class={styles.title} onClick={startEditing}>{currentEntry().title}</h1>
                  </Show>

                  <Show when={bodyWithMissingTags(currentEntry())}>
                    <div
                      class={`${styles.body} ${styles.markdown} ${styles.prose} markdownish`}
                      innerHTML={renderMarkdownishToHtml(bodyWithMissingTags(currentEntry()), {
                        compactLinks: true,
                        hashtagHref: "/?q=%23",
                        hashtags: true,
                        tasks: true,
                      })}
                      onClick={(event) => {
                        handleEntryTagClick(event);
                        void handleEntryTaskClick(event);
                      }}
                    />
                  </Show>

                  <Show when={actionError()}>
                    <p class="hn-error">{actionError()}</p>
                  </Show>
                </Show>
              </article>

              <section class="hn-panel hn-stack">
                <h2 class="hn-heading">
                  {currentEntry().commentCount} {currentEntry().commentCount === 1 ? "note" : "notes"}
                </h2>

                <For each={detail()?.comments ?? []}>
                  {(comment) => (
                    <article class={styles.comment}>
                      <Show
                        when={editingCommentId() === comment.id}
                        fallback={
                          <>
                            <div
                              class={`${styles.commentBody} ${styles.markdown} markdownish`}
                              innerHTML={renderMarkdownishToHtml(comment.body, { tasks: true })}
                              onClick={(event) => void handleCommentTaskClick(event, comment.id, comment.body)}
                            />
                            <p class={styles.subtext}>
                              {formatRelativeTimestamp(comment.createdAt)}
                              <span> | </span>
                              <TextButton
                                type="button"
                                inline
                                onClick={() => startCommentEditing(comment.id, comment.body)}
                                disabled={commentDeletingId() === comment.id}
                              >
                                edit
                              </TextButton>
                              <span> | </span>
                              <TextButton
                                type="button"
                                inline
                                onClick={() => handleCommentDelete(comment.id)}
                                disabled={commentDeletingId() === comment.id}
                              >
                                {commentDeletingId() === comment.id ? "deleting..." : "delete"}
                              </TextButton>
                            </p>
                          </>
                        }
                      >
                        <form class="item-edit-form" onSubmit={(event) => submitCommentEdit(event, comment.id)}>
                          <span id={`comment-edit-${comment.id}-label`} class="visually-hidden">edit note</span>
                          <Editor
                            id={`comment-edit-${comment.id}`}
                            ariaLabelledby={`comment-edit-${comment.id}-label`}
                            value={editingCommentBody()}
                            onInput={setEditingCommentBody}
                            onSubmit={() => void submitCommentEdit(new Event("submit") as SubmitEvent, comment.id)}
                            variant="borderless"
                            autofocus
                          />
                          <p class={styles.subtext} style={{ "margin-top": "var(--space-1)" }}>
                            <TextButton
                              type="button"
                              inline
                              onClick={(event) => void submitCommentEdit(new Event("submit") as SubmitEvent, comment.id)}
                              disabled={commentSavingId() === comment.id}
                            >
                              {commentSavingId() === comment.id ? "saving..." : "save"}
                            </TextButton>
                            <span> | </span>
                            <TextButton type="button" inline onClick={cancelCommentEditing}>
                              cancel
                            </TextButton>
                          </p>
                        </form>
                      </Show>
                    </article>
                  )}
                </For>

                <Show when={commentActionError()}>
                  <p class="hn-error">{commentActionError()}</p>
                </Show>

                <form class="hn-form" onSubmit={submitComment}>
                  <span id="comment-body-label" class="hn-label">add note</span>
                  <Editor
                    id="comment-body"
                    ariaLabelledby="comment-body-label"
                    value={commentBody()}
                    compact
                    onInput={setCommentBody}
                    onSubmit={() => void submitComment(new Event("submit") as SubmitEvent)}
                    placeholder="private note, quote, or follow-up"
                  />
                  <Show when={commentError()}>
                    <p class="hn-error">{commentError()}</p>
                  </Show>
                  <Button
                    type="submit"
                    disabled={isCommentSaving()}
                  >
                    {isCommentSaving() ? "adding..." : "add note"}
                  </Button>
                </form>
              </section>
            </>
          )}
        </Show>
    </>
  );
}
