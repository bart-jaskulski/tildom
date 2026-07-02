import { Title } from "@solidjs/meta";
import { useNavigate, useParams } from "@solidjs/router";
import { For, Show, createEffect, createResource, createSignal, onMount, onCleanup } from "solid-js";
import { isServer } from "solid-js/web";
import { createVimNavigation } from "@tildom/ui";
import AppNav from "~/components/AppNav";
import { dbVersion } from "~/lib/db";
import { formatRelativeTimestamp } from "~/lib/entries";
import { renderMarkdownToHtml } from "~/lib/markdown";
import { handleTextareaKeyboardSubmit, resizeTextareaToFitContent } from "~/lib/textarea";
import { addCommentToEntry, deleteComment, deleteEntry, fetchEntryDetail, isEntryStoreReady, updateComment, updateEntry } from "~/stores/entryStore";

export default function ItemPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [commentBody, setCommentBody] = createSignal("");
  const [editTitle, setEditTitle] = createSignal("");
  const [editContent, setEditContent] = createSignal("");
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
  let editContentTextarea: HTMLTextAreaElement | undefined;
  let commentBodyTextarea: HTMLTextAreaElement | undefined;
  let editingCommentTextarea: HTMLTextAreaElement | undefined;
  const [detail, { refetch }] = createResource(
    () => (!isServer && isEntryStoreReady() ? [params.id ?? "", dbVersion()] as const : null),
    ([entryId]) => fetchEntryDetail(entryId),
  );
  const entry = () => detail()?.entry ?? null;

  onMount(() => {
    createVimNavigation({
      onEscape: () => {
        navigate("/");
      },
      onSearch: () => {
        const searchInput = document.querySelector('.hn-search input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      onFocusInput: () => {
        startEditing();
      },
      customCommands: {
        t: (lastKey) => {
          if (lastKey === "g") navigate("/settings");
        },
        T: (lastKey) => {
          if (lastKey === "g") navigate("/settings");
        },
        x: (lastKey) => {
          if (lastKey === "g") {
            const currentEntry = entry();
            if (currentEntry && currentEntry.canonicalUrl) {
              window.open(currentEntry.canonicalUrl, "_blank", "noreferrer");
            }
          }
        },
        h: () => {
          window.history.back();
        },
        l: () => {
          window.history.forward();
        },
        d: () => {
          void handleDelete();
        }
      }
    });
  });

  createEffect(() => {
    editContent();
    if (isEditing() && editContentTextarea) {
      resizeTextareaToFitContent(editContentTextarea);
    }
  });

  createEffect(() => {
    commentBody();
    if (commentBodyTextarea) {
      resizeTextareaToFitContent(commentBodyTextarea);
    }
  });

  createEffect(() => {
    editingCommentBody();
    if (editingCommentTextarea) {
      resizeTextareaToFitContent(editingCommentTextarea);
    }
  });

  const startEditing = () => {
    const currentEntry = entry();
    if (!currentEntry) {
      return;
    }

    setEditTitle(currentEntry.title);
    setEditContent(currentEntry.sourceUrl ?? currentEntry.canonicalUrl ?? currentEntry.body);
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

  return (
    <main class="hn-page">
      <Title>{entry()?.title ? `${entry()!.title} | mark.tildom` : "Item | mark.tildom"}</Title>
      <AppNav />

      <section class="hn-content hn-stack">
        <Show when={entry()} fallback={
          <p class="hn-status">{detail.loading ? "Loading item..." : "Item not found"}</p>
        }>
          {(currentEntry) => (
            <>
              <article>
                <div class="entry-subtext">
                  <Show when={currentEntry().domain}>
                    <span>{currentEntry().domain}</span>
                  </Show>
                  <span>{currentEntry().domain ? " | " : ""}{formatRelativeTimestamp(currentEntry().createdAt)}</span>
                  <Show when={!isEditing()}>
                    <span> | </span>
                    <button type="button" class="hn-link-button" onClick={startEditing}>
                      edit
                    </button>
                    <span> | </span>
                    <button
                      type="button"
                      class="hn-link-button"
                      onClick={handleDelete}
                      disabled={isDeleting()}
                    >
                      {isDeleting() ? "deleting..." : "delete"}
                    </button>
                  </Show>
                </div>

                <Show when={!isEditing()} fallback={
                  <form class="hn-form hn-stack item-edit-form" onSubmit={submitEdit}>
                    <label class="hn-label" for="edit-title">title</label>
                    <input
                      id="edit-title"
                      value={editTitle()}
                      onInput={(event) => setEditTitle(event.currentTarget.value)}
                      class="hn-input"
                    />

                    <label class="hn-label" for="edit-content">content</label>
                    <textarea
                      id="edit-content"
                      ref={(element) => {
                        editContentTextarea = element;
                        resizeTextareaToFitContent(element);
                      }}
                      value={editContent()}
                      onInput={(event) => {
                        setEditContent(event.currentTarget.value);
                        resizeTextareaToFitContent(event.currentTarget);
                      }}
                      onKeyDown={handleTextareaKeyboardSubmit}
                      rows={5}
                      class="hn-textarea"
                    />

                    <Show when={actionError()}>
                      <p class="hn-error">{actionError()}</p>
                    </Show>

                    <div class="hn-actions">
                      <button type="submit" disabled={isEditSaving()} class="hn-button">
                        {isEditSaving() ? "saving..." : "save changes"}
                      </button>
                      <button type="button" class="hn-button" onClick={cancelEditing}>
                        cancel
                      </button>
                    </div>
                  </form>
                }>
                  <h1 class="item-title">{currentEntry().title}</h1>

                  <Show when={currentEntry().canonicalUrl}>
                    <a href={currentEntry().canonicalUrl!} target="_blank" rel="noreferrer" class="item-url entry-subtext">
                      {currentEntry().canonicalUrl}
                    </a>
                  </Show>

                  <Show when={currentEntry().excerpt}>
                    <p class="entry-preview">{currentEntry().excerpt}</p>
                  </Show>

                  <Show when={currentEntry().body}>
                    <div class="item-body hn-markdown prose" innerHTML={renderMarkdownToHtml(currentEntry().body)} />
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
                    <article class="comment">
                      <Show
                        when={editingCommentId() === comment.id}
                        fallback={
                          <>
                            <div class="comment-body hn-markdown" innerHTML={renderMarkdownToHtml(comment.body)} />
                            <p class="entry-subtext">
                              {formatRelativeTimestamp(comment.createdAt)}
                              <span> | </span>
                              <button
                                type="button"
                                class="hn-link-button"
                                onClick={() => startCommentEditing(comment.id, comment.body)}
                                disabled={commentDeletingId() === comment.id}
                              >
                                edit
                              </button>
                              <span> | </span>
                              <button
                                type="button"
                                class="hn-link-button"
                                onClick={() => handleCommentDelete(comment.id)}
                                disabled={commentDeletingId() === comment.id}
                              >
                                {commentDeletingId() === comment.id ? "deleting..." : "delete"}
                              </button>
                            </p>
                          </>
                        }
                      >
                        <form class="hn-form hn-stack item-edit-form" onSubmit={(event) => submitCommentEdit(event, comment.id)}>
                          <label class="hn-label visually-hidden" for={`comment-edit-${comment.id}`}>edit comment</label>
                          <textarea
                            id={`comment-edit-${comment.id}`}
                            ref={(element) => {
                              editingCommentTextarea = element;
                              resizeTextareaToFitContent(element);
                            }}
                            value={editingCommentBody()}
                            onInput={(event) => {
                              setEditingCommentBody(event.currentTarget.value);
                              resizeTextareaToFitContent(event.currentTarget);
                            }}
                            onKeyDown={handleTextareaKeyboardSubmit}
                            rows={4}
                            class="hn-textarea"
                          />
                          <div class="hn-actions">
                            <button type="submit" class="hn-button" disabled={commentSavingId() === comment.id}>
                              {commentSavingId() === comment.id ? "saving..." : "save"}
                            </button>
                            <button type="button" class="hn-button" onClick={cancelCommentEditing}>
                              cancel
                            </button>
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
                  <textarea
                    id="comment-body"
                    ref={(element) => {
                      commentBodyTextarea = element;
                      resizeTextareaToFitContent(element);
                    }}
                    value={commentBody()}
                    onInput={(event) => {
                      setCommentBody(event.currentTarget.value);
                      resizeTextareaToFitContent(event.currentTarget);
                    }}
                    onKeyDown={handleTextareaKeyboardSubmit}
                    rows={4}
                    placeholder="private note, quote, or follow-up"
                    class="hn-textarea"
                  />
                  <Show when={commentError()}>
                    <p class="hn-error">{commentError()}</p>
                  </Show>
                  <button
                    type="submit"
                    disabled={isCommentSaving()}
                    class="hn-button"
                  >
                    {isCommentSaving() ? "adding..." : "add comment"}
                  </button>
                </form>
              </section>
            </>
          )}
        </Show>
      </section>
    </main>
  );
}
