# Mark AI Tagging Design

## Idea

Mark should add automatic AI-assisted tagging for saved link entries. Tags are meant to reduce the manual taxonomy work that makes bookmark collections decay over time: the user saves a link, Mark fetches normal link metadata, then a background AI request suggests a small number of reusable tags.

Tagging is intentionally a secondary capability. It must improve browsing and search when it works, but it must never block saving, editing, deleting, reading, commenting, or offline use.

This design is scoped to `apps/mark`. It borrows the existing server-side AI pattern from `apps/do`, but it does not extract a shared AI package yet.

## Goals

- Auto-tag link entries once, immediately after creation.
- Keep Mark local-first: bookmark data remains in browser SQLite/OPFS, and the app remains useful without network or AI configuration.
- Send only link-derived metadata to the AI endpoint: title, full URL, and fetched excerpt.
- Prefer reuse of the user's existing tag vocabulary over creating new tags.
- Prevent tag vocabulary inflation with deterministic caps and normalization.
- Make tags useful in the main list, detail view, search, and filtering.
- Let users manually correct tags from the existing entry edit form.
- Keep all AI failures silent in the main save flow.

## Non-Goals

- No speculative metadata or AI requests before the user saves an entry.
- No full-page scraping or article-content extraction for tagging.
- No AI tagging for notes.
- No automatic retagging of existing entries.
- No retagging after a user edits a URL, title, body, excerpt, or comments.
- No visible "tagging..." progress state.
- No user setting for disabling AI tagging in v1.
- No tag cloud, tag sidebar, or dedicated tag-management screen in v1.
- No reasoning, confidence scores, or explanations from the tag endpoint.
- No shared AI abstraction across apps until reuse pressure is clearer.
- No sync or hosted-account behavior changes.

## User Experience

### Link Creation

1. The user pastes a URL and saves it.
2. Mark creates the local entry.
3. Mark fetches metadata using the existing metadata flow.
4. Mark sends `title`, `url`, `excerpt`, and the current local tag vocabulary to `/api/tags`.
5. If the endpoint returns valid tags, the client normalizes and applies them.
6. If any step fails, the save remains successful and no user-facing error appears.

The entry appears immediately after save. Tags appear later only if the background tagging request succeeds.

### Notes

Notes are never sent to AI and are never auto-tagged.

Users may manually tag notes through the same metadata edit field used for link entries.

### Main List

When an entry has tags, show them inline in the row subtext as clickable `#tag` links. Keep the row compact and consistent with the existing Mark visual style.

Clicking `#tag` filters the list using the existing query parameter:

```txt
/?q=%23tag-name
```

No sidebar or tag cloud is added in v1.

### Detail View

In read mode, show tags as clickable `#tag` links near the entry metadata, under or near the URL/excerpt area.

In edit mode, add a `tags` field to the existing edit form. The field accepts comma-separated or whitespace-separated tags. Saving the form replaces the full tag set for that entry.

Manual tag validation errors are shown in the normal edit form error area. Unlike AI suggestions, manual user input must not be silently dropped.

## Data Model

Use normalized local SQLite tables.

```sql
CREATE TABLE IF NOT EXISTS tags (
  id TEXT NOT NULL PRIMARY KEY DEFAULT '',
  name TEXT NOT NULL UNIQUE DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id TEXT NOT NULL DEFAULT '',
  tag_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, tag_id)
);
```

`entry_tags` does not include a `source` column. AI tagging runs only once on link creation, and later manual edits simply replace the entry's tags.

The global tag cap counts tags currently used by at least one entry. Orphaned tag rows should be pruned after entry deletion and manual tag replacement.

Suggested indexes:

```sql
CREATE INDEX IF NOT EXISTS entry_tags_tag_id_idx ON entry_tags(tag_id);
CREATE INDEX IF NOT EXISTS entry_tags_entry_id_idx ON entry_tags(entry_id);
```

## Tag Rules

### Caps

- Maximum tags per entry: `5`.
- Maximum currently used tags per local instance: `50`.

AI suggestions that would exceed the global cap are silently reduced:

- Existing tags may still be applied.
- New tags are dropped once the cap would be exceeded.
- The entry may end up with fewer than `5` tags.

Manual edits use strict validation:

- More than `5` tags for one entry is an error.
- More than `50` currently used tags globally is an error.
- The edit is not saved until the user fixes the input.

### Normalization

Tags normalize to lowercase ASCII slugs:

- Strip leading `#`.
- Trim surrounding whitespace.
- Convert spaces and underscores to hyphens.
- Allow only `a-z`, `0-9`, and hyphens.
- Collapse repeated hyphens.
- Remove leading and trailing hyphens.
- Reject empty tags.
- Reject tags longer than `32` characters.
- Deduplicate after normalization.

Examples:

```txt
"#AI"              -> "ai"
"Machine Learning" -> "machine-learning"
"dev_tools"        -> "dev-tools"
"---"              -> rejected
```

## Search and Filtering

Tag filtering uses the existing `q` search parameter.

Explicit tag search:

```txt
#ai
```

This should filter strictly by tag name.

Normal full-text search should also weakly match tag text. A query like:

```txt
ai
```

may match entries tagged `ai`, but tag matches should not outrank strong title, URL, domain, body, excerpt, or comment matches.

The search index should include tag text in a way that supports both:

- strict `#tag` filtering via joins against `tags` / `entry_tags`;
- weak normal search recall through the existing local search behavior.

## API Design

Add a separate Mark server endpoint:

```txt
POST /api/tags
```

Request body:

```json
{
  "title": "Article title",
  "url": "https://example.com/article",
  "excerpt": "Optional fetched excerpt",
  "existingTags": ["ai", "local-first", "sqlite"]
}
```

Response body:

```json
{
  "tags": ["ai", "sqlite"]
}
```

The endpoint returns only tag names. It does not return reasoning, confidence, descriptions, or UI copy.

When `GOOGLE_API_KEY` is missing, return a normal server error such as:

```json
{
  "error": "AI tagging is not configured"
}
```

with status `503`. The client catches this and ignores it during link creation.

## AI Provider

Use the same provider family and server-side pattern as `apps/do`:

- `@ai-sdk/google`
- `ai`
- `GOOGLE_API_KEY`
- Gemini model comparable to the existing `do` endpoint

The prompt should instruct the model to:

- return only tags;
- output at most `5` tags;
- prefer tags from `existingTags`;
- create new tags only when the existing vocabulary does not fit;
- avoid synonyms and variants of existing tags;
- use short lowercase slug-like names;
- tag based only on title, URL, and excerpt.

The client remains the final authority. It normalizes, deduplicates, enforces caps, and drops invalid AI output.

## Rate Limiting

`/api/tags` should have server-side rate limiting scoped inside `apps/mark`.

Suggested policy:

- `10` requests per minute per client.
- `100` requests per hour per client.

Rate-limit failures are normal endpoint errors. The client ignores them during background tagging.

## Implementation Plan

1. Add AI dependencies to `apps/mark` if not already present:
   - `@ai-sdk/google`
   - `ai`
   - `zod`, if useful for endpoint validation
2. Add local tag schema tables and indexes to `apps/mark/src/lib/schema.ts`.
3. Add tag utility functions:
   - normalize raw tag text;
   - parse manual tag input;
   - enforce per-entry and global caps;
   - prune orphan tags.
4. Extend entry store types and queries so list and detail entries include tag names.
5. Add store operations:
   - fetch current tag vocabulary;
   - replace tags for an entry;
   - apply AI tags to a newly created link entry;
   - prune orphan tags after deletes/replacements.
6. Add `/api/tags` to `apps/mark/server/app.ts` or a small server module imported by it.
7. Add a client helper for `/api/tags`.
8. Chain background AI tagging after link metadata is available during link creation.
9. Update search behavior:
   - strict `#tag` filtering;
   - weak normal tag matching.
10. Update `EntryCard` and item detail UI to display clickable tags.
11. Add a `tags` field to the existing item edit form.
12. Add minimal README documentation for optional AI tagging and `GOOGLE_API_KEY`.

## Acceptance Criteria

- Saving a link succeeds even if metadata fetching fails, AI tagging fails, the app is offline, the server is missing `GOOGLE_API_KEY`, or `/api/tags` is rate-limited.
- AI tagging happens only for link entries created from URL-only input.
- AI tagging sends only title, URL, excerpt, and existing tag names to the server.
- Notes are never sent to `/api/tags`.
- AI suggestions are normalized and capped at `5` tags per entry.
- The local instance never exceeds `50` currently used tags from AI output.
- Once the `50` tag cap is full, AI can still apply existing tags but cannot create new tags.
- Manual tag edits replace the full tag set for that entry.
- Manual tag edits enforce the same `5` per-entry and `50` global caps with visible form errors.
- Deleting entries and replacing tag sets prunes orphan tag rows.
- Tags display inline in the main entry list when present.
- Tags display on the item detail page when present.
- Clicking a displayed tag navigates to `?q=%23tag-name`.
- Searching `#tag-name` strictly filters by tag.
- Normal search can weakly match tag names.
- No visible background tagging status appears.
- No AI tagging setting is added.
- `apps/mark/README.md` documents optional AI tagging and `GOOGLE_API_KEY`.

## Open Implementation Details

- Exact CSS class names and placement should follow the current Mark TUI style.
- Exact ranking weight for normal tag search should be tuned conservatively so title, URL, domain, excerpt, body, and comments remain stronger signals.
- The rate-limit helper can be copied locally from `do` if needed; do not extract a shared package for this alone.
- Tests should cover normalization, cap enforcement, strict tag filtering, manual replacement, orphan pruning, endpoint validation, and silent client failure behavior.
