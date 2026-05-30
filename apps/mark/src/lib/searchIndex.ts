import { query } from "~/lib/db";
import type { SearchResult } from "~/lib/entries";

type SearchDocumentRow = {
  entry_id: string;
  title: string;
  body: string;
  url: string;
  domain: string;
  excerpt: string;
  comments_text: string;
  comment_count: number;
  updated_at: number;
  created_at: number;
  last_commented_at: number | null;
};

const normalizeSearchInput = (input: string) => input.trim().toLowerCase().replace(/\s+/g, " ");

const extractSearchTerms = (input: string) => input.match(/[\p{L}\p{N}_]+/gu) ?? [];

const buildFtsQuery = (terms: string[]) => terms
  .map((term) => `"${term.replace(/"/g, '""')}"*`)
  .join(" AND ");

const buildContainsClause = (terms: string[]) => terms.map(() => "search_documents.searchable_text LIKE ?").join(" AND ");

const buildContainsParams = (terms: string[]) => terms.map((term) => `%${term}%`);

const includesAllTerms = (value: string, terms: string[]) => {
  const haystack = value.toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const countMatchingTerms = (value: string, terms: string[]) => {
  const haystack = value.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
};

const sliceSnippet = (value: string, term: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const haystack = trimmed.toLowerCase();
  const index = haystack.indexOf(term.toLowerCase());

  if (index === -1 || trimmed.length <= 140) {
    return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
  }

  const start = Math.max(0, index - 48);
  const end = Math.min(trimmed.length, index + 92);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < trimmed.length ? "..." : "";
  return `${prefix}${trimmed.slice(start, end)}${suffix}`;
};

const computeScore = (row: SearchDocumentRow, terms: string[]) => {
  const title = row.title.toLowerCase();
  const url = row.url.toLowerCase();
  const domain = row.domain.toLowerCase();
  const body = row.body.toLowerCase();
  const excerpt = row.excerpt.toLowerCase();
  const comments = row.comments_text.toLowerCase();
  const normalizedQuery = terms.join(" ");

  let score = 0;

  if (title === normalizedQuery) {
    score += 400;
  }

  if (url === normalizedQuery) {
    score += 360;
  }

  if (domain === normalizedQuery) {
    score += 340;
  }

  if (includesAllTerms(title, terms)) {
    score += 260 + countMatchingTerms(title, terms) * 12;
  }

  if (includesAllTerms(url, terms)) {
    score += 220 + countMatchingTerms(url, terms) * 10;
  }

  if (includesAllTerms(domain, terms)) {
    score += 200 + countMatchingTerms(domain, terms) * 10;
  }

  if (includesAllTerms(body, terms)) {
    score += 150 + countMatchingTerms(body, terms) * 8;
  }

  if (includesAllTerms(excerpt, terms)) {
    score += 110 + countMatchingTerms(excerpt, terms) * 6;
  }

  if (includesAllTerms(comments, terms)) {
    score += 90 + countMatchingTerms(comments, terms) * 5;
  }

  const recency = row.last_commented_at ?? row.created_at;
  score += Math.max(0, Math.floor(recency / 1_000_000_000_000));

  return score;
};

const resolveMatchContext = (row: SearchDocumentRow, terms: string[]) => {
  const fields: Array<{ label: string; value: string }> = [
    { label: "Title", value: row.title },
    { label: "URL", value: row.url },
    { label: "Domain", value: row.domain },
    { label: "Note", value: row.body },
    { label: "Excerpt", value: row.excerpt },
    { label: "Comment", value: row.comments_text },
  ];

  const exactField = fields.find((field) => includesAllTerms(field.value, terms));
  const fallbackField = exactField ?? fields.find((field) => countMatchingTerms(field.value, terms) > 0) ?? fields[0]!;
  const firstTerm = terms[0] ?? "";

  return {
    matchLabel: fallbackField.label,
    matchText: sliceSnippet(fallbackField.value, firstTerm),
  };
};

export const searchLocalEntries = async (rawQuery: string): Promise<SearchResult[]> => {
  const normalizedQuery = normalizeSearchInput(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const terms = extractSearchTerms(normalizedQuery);
  if (terms.length === 0) {
    return [];
  }

  const ftsQuery = buildFtsQuery(terms);

  const ftsRows = await query<SearchDocumentRow>(
    `
      SELECT
        search_documents_fts.entry_id,
        search_documents_fts.title,
        search_documents_fts.body,
        search_documents_fts.url,
        search_documents_fts.domain,
        search_documents_fts.excerpt,
        search_documents_fts.comments_text,
        search_documents_fts.comment_count,
        search_documents_fts.updated_at,
        e.created_at,
        e.last_commented_at
      FROM search_documents_fts
      JOIN entries e ON e.id = search_documents_fts.entry_id
      WHERE search_documents_fts MATCH ?
      ORDER BY
        bm25(search_documents_fts, 0.0, 8.0, 5.0, 2.0, 2.0, 3.0, 1.0, 0.0, 0.0) ASC,
        COALESCE(e.last_commented_at, e.created_at) DESC
      LIMIT 200
    `,
    [ftsQuery],
  );

  const containsRows = await query<SearchDocumentRow>(
    `
      SELECT
        search_documents.entry_id,
        search_documents.title,
        search_documents.body,
        search_documents.url,
        search_documents.domain,
        search_documents.excerpt,
        search_documents.comments_text,
        search_documents.comment_count,
        search_documents.updated_at,
        e.created_at,
        e.last_commented_at
      FROM search_documents
      JOIN entries e ON e.id = search_documents.entry_id
      WHERE ${buildContainsClause(terms)}
      ORDER BY COALESCE(e.last_commented_at, e.created_at) DESC
      LIMIT 200
    `,
    buildContainsParams(terms),
  );

  const seenEntryIds = new Set(ftsRows.map((row) => row.entry_id));
  const rows = [
    ...ftsRows,
    ...containsRows.filter((row) => {
      if (seenEntryIds.has(row.entry_id)) {
        return false;
      }

      seenEntryIds.add(row.entry_id);
      return true;
    }),
  ];

  return rows
    .map((row) => {
      const score = computeScore(row, terms);
      const context = resolveMatchContext(row, terms);

      return {
        id: row.entry_id,
        sourceUrl: row.url || null,
        canonicalUrl: row.url || null,
        domain: row.domain || null,
        title: row.title,
        body: row.body,
        excerpt: row.excerpt || null,
        excerptStatus: row.excerpt ? "ready" : "idle",
        excerptError: null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastCommentedAt: row.last_commented_at,
        commentCount: row.comment_count,
        score,
        matchLabel: context.matchLabel,
        matchText: context.matchText,
      } satisfies SearchResult;
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightRecency = right.lastCommentedAt ?? right.createdAt;
      const leftRecency = left.lastCommentedAt ?? left.createdAt;
      return rightRecency - leftRecency;
    });
};
