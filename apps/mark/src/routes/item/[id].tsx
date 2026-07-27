import { Title } from "@solidjs/meta";
import { A, useNavigate, useParams } from "@solidjs/router";
import { For, Show, createResource, createSignal, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import {
  findMarkdownTaskIndex,
  renderMarkdownishToHtml,
  toggleMarkdownTask,
} from "@tildom/markdownish";
import { useVimKeymaps } from "@tildom/ui";
import Button from "~/components/Button";
import ItemLoading from "~/components/ItemLoading";
import Textarea from "~/components/Textarea";
import { client } from "~/lib/db";
import { formatRelativeTimestamp } from "~/lib/entries";
import { addCommentToEntry, deleteComment, deleteEntry, fetchEntryDetail, isEntryStoreReady, updateComment, updateEntry } from "~/stores/entryStore";
import TextButton from "~/components/TextButton";
import styles from "./[id].module.css";

export default function ItemPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [commentBody, setCommentBody] = createSignal("");
  const [editTitle, setEditTitle] = createSignal("");
  const [editContent, setEditContent] = createSignal("");
  const [editTags, setEditTags] = createSignal("");
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
  const [detail, { refetch }] = createResource(
    () => (!isServer && isEntryStoreReady() ? [params.id ?? "", client.dbVersion] as const : null),
    ([entryId]) => fetchEntryDetail(entryId),
  );
  const entry = () => detail()?.entry ?? null;
  useVimKeymaps([
    { lhs: "i", callback: () => startEditing(), help: "edit entry" },
    { lhs: ["o", "gx"], callback: () => {
      const currentEntry = entry();
      if (currentEntry?.canonicalUrl) window.open(currentEntry.canonicalUrl, "_blank", "noreferrer");
    }, help: "open original URL" },
    { lhs: "d", callback: () => void handleDelete(), help: "delete entry" },
  ]);

  const startEditing = () => {
    const currentEntry = entry();
    if (!currentEntry) {
      return;
    }

    setEditTitle(currentEntry.title);
    setEditContent((currentEntry.sourceUrl ?? currentEntry.canonicalUrl ?? currentEntry.body).replace(/^\n/, ""));
    setEditTags(currentEntry.tags.join(" "));
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
      await updateEntry(currentEntry.id, {
        title: editTitle(),
        content: editContent(),
        tags: editTags(),
      });
      setIsEditing(false);
      await refetch();
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
      await addCommentToEntry(currentEntry.id, commentBody());
      setCommentBody("");
      await refetch();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed to add comment");
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
      await updateComment(commentId, editingCommentBody());
      cancelCommentEditing();
      await refetch();
    } catch (err) {
      setCommentActionError(err instanceof Error ? err.message : "Failed to update comment");
    } finally {
      setCommentSavingId(null);
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!window.confirm("Delete this comment?")) {
      return;
    }

    setCommentDeletingId(commentId);
    setCommentActionError(null);

    try {
      await deleteComment(commentId);
      if (editingCommentId() === commentId) {
        cancelCommentEditing();
      }
      await refetch();
    } catch (err) {
      setCommentActionError(err instanceof Error ? err.message : "Failed to delete comment");
    } finally {
      setCommentDeletingId(null);
    }
  };

  const handleEntryTaskClick = async (event: MouseEvent) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    const currentEntry = entry();
    if (taskIndex === null || !currentEntry) return;

    try {
      await updateEntry(currentEntry.id, {
        title: currentEntry.title,
        content: toggleMarkdownTask(currentEntry.body, taskIndex),
        tags: currentEntry.tags.join(" "),
      });
      await refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update task");
    }
  };

  const handleCommentTaskClick = async (event: MouseEvent, commentId: string, body: string) => {
    const taskIndex = findMarkdownTaskIndex(event.target);
    if (taskIndex === null) return;

    try {
      await updateComment(commentId, toggleMarkdownTask(body, taskIndex));
      await refetch();
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
                    <span>{currentEntry().domain}</span>
                  </Show>
                  <span>{currentEntry().domain ? " | " : ""}{formatRelativeTimestamp(currentEntry().createdAt)}</span>
                  <Show when={!isEditing()}>
                    <span> | </span>
                    <TextButton type="button" inline onClick={startEditing}>
                      edit
                    </TextButton>
                    <span> | </span>
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

                <Show when={!isEditing()} fallback={
                  <form class="hn-form item-edit-form" onSubmit={submitEdit}>
                    <label class="hn-label" for="edit-title">title</label>
                    <input
                      id="edit-title"
                      value={editTitle()}
                      onInput={(event) => setEditTitle(event.currentTarget.value)}
                      class="hn-input"
                    />

                    <label class="hn-label" for="edit-content">content</label>
                    <Textarea
                      id="edit-content"
                      value={editContent()}
                      onInput={(event) => setEditContent(event.currentTarget.value)}
                      rows={5}
                    />

                    <label class="hn-label" for="edit-tags">tags</label>
                    <input
                      id="edit-tags"
                      value={editTags()}
                      onInput={(event) => setEditTags(event.currentTarget.value)}
                      class="hn-input"
                    />

                    <Show when={actionError()}>
                      <p class="hn-error">{actionError()}</p>
                    </Show>

                    <div class={styles.actions}>
                      <Button type="submit" disabled={isEditSaving()}>
                        {isEditSaving() ? "saving..." : "save changes"}
                      </Button>
                      <Button type="button" onClick={cancelEditing}>
                        cancel
                      </Button>
                    </div>
                  </form>
                }>
                  <h1 class={styles.title}>{currentEntry().title}</h1>

                  <Show when={currentEntry().canonicalUrl}>
                    <a href={currentEntry().canonicalUrl!} target="_blank" rel="noreferrer" class={`${styles.url} ${styles.subtext}`}>
                      {currentEntry().canonicalUrl}
                    </a>
                  </Show>

                  <Show when={currentEntry().excerpt}>
                    <p class={styles.preview}>{currentEntry().excerpt}</p>
                  </Show>

                  <Show when={currentEntry().tags.length > 0}>
                    <p class={styles.tags}>
                      <For each={currentEntry().tags}>
                        {(tag) => (
                          <A href={`/?q=${encodeURIComponent(`#${tag}`)}`} class={styles.tag}>
                            #{tag}
                          </A>
                        )}
                      </For>
                    </p>
                  </Show>

                  <Show when={currentEntry().body}>
                    <div
                      class={`${styles.body} ${styles.markdown} ${styles.prose} markdownish`}
                      innerHTML={renderMarkdownishToHtml(currentEntry().body, { tasks: true })}
                      onClick={(event) => void handleEntryTaskClick(event)}
                    />
                  </Show>

                  <Show when={actionError()}>
                    <p class="hn-error">{actionError()}</p>
                  </Show>
                </Show>
              </article>

              <section class="hn-panel hn-stack">
                <h2 class="hn-heading">
                  {currentEntry().commentCount} {currentEntry().commentCount === 1 ? "comment" : "comments"}
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
                        <form class="hn-form hn-stack item-edit-form" onSubmit={(event) => submitCommentEdit(event, comment.id)}>
                          <label class="hn-label visually-hidden" for={`comment-edit-${comment.id}`}>edit comment</label>
                          <Textarea
                            id={`comment-edit-${comment.id}`}
                            value={editingCommentBody()}
                            onInput={(event) => setEditingCommentBody(event.currentTarget.value)}
                            rows={4}
                          />
                          <div class={styles.actions}>
                            <Button type="submit" disabled={commentSavingId() === comment.id}>
                              {commentSavingId() === comment.id ? "saving..." : "save"}
                            </Button>
                            <Button type="button" onClick={cancelCommentEditing}>
                              cancel
                            </Button>
                          </div>
                        </form>
                      </Show>
                    </article>
                  )}
                </For>

                <Show when={commentActionError()}>
                  <p class="hn-error">{commentActionError()}</p>
                </Show>

                <form class="hn-form" onSubmit={submitComment}>
                  <label class="hn-label" for="comment-body">add comment</label>
                  <Textarea
                    id="comment-body"
                    value={commentBody()}
                    onInput={(event) => setCommentBody(event.currentTarget.value)}
                    rows={4}
                    placeholder="private note, quote, or follow-up"
                  />
                  <Show when={commentError()}>
                    <p class="hn-error">{commentError()}</p>
                  </Show>
                  <Button
                    type="submit"
                    disabled={isCommentSaving()}
                  >
                    {isCommentSaving() ? "adding..." : "add comment"}
                  </Button>
                </form>
              </section>
            </>
          )}
        </Show>
    </>
  );
}
