import { describe, expect, it } from "vitest";
import { getMarkdownListEdit, renderMarkdownishToHtml } from "./index";

describe("renderMarkdownishToHtml", () => {
  it("renders semantic, sanitized HTML without adding marker text", () => {
    expect(renderMarkdownishToHtml("**important** <script>bad()</script>"))
      .toBe("<p><strong>important</strong> &lt;script&gt;bad()&lt;/script&gt;</p>");
  });

  it("completes unfinished Markdown only while streaming", () => {
    expect(renderMarkdownishToHtml("This is **still streaming", { streaming: true }))
      .toBe("<p>This is <strong>still streaming</strong></p>");
    expect(renderMarkdownishToHtml("This is **still streaming"))
      .toBe("<p>This is **still streaming</p>");
  });

  it("optionally makes hashtags interactive outside links and code", () => {
    expect(renderMarkdownishToHtml("#hello `#code` [#link](https://example.com)", { hashtags: true }))
      .toContain('data-markdownish-tag="hello"');
    expect(renderMarkdownishToHtml("#hello `#code` [#link](https://example.com)", { hashtags: true }))
      .not.toContain('data-markdownish-tag="code"');
  });

  it("renders interactive GFM tasks when requested", () => {
    expect(renderMarkdownishToHtml("- [ ] todo\n- [x] done", { tasks: true }))
      .toContain('data-markdownish-task="0"');
    expect(renderMarkdownishToHtml("- [ ] todo\n- [x] done", { tasks: true }))
      .toContain('aria-pressed="true"');
  });
});

describe("toggleMarkdownTask", () => {
  it("toggles only the requested task occurrence", async () => {
    const { toggleMarkdownTask } = await import("./index");
    expect(toggleMarkdownTask("- [ ] first\n- ordinary\n- [x] second", 1))
      .toBe("- [ ] first\n- ordinary\n- [ ] second");
  });
});

describe("getMarkdownListEdit", () => {
  it.each([
    ["- first", "\n- "],
    ["  * first", "\n  * "],
    ["- [x] done", "\n- [ ] "],
    ["3. third", "\n4. "],
  ])("continues %s", (value, text) => {
    expect(getMarkdownListEdit(value, value.length, value.length)).toMatchObject({ text });
  });

  it.each(["- ", "- [ ] ", "1. "])("exits an empty list item: %s", (value) => {
    expect(getMarkdownListEdit(value, value.length, value.length)).toEqual({
      from: 0,
      to: value.length,
      text: "",
      caret: 0,
    });
  });

  it("leaves ordinary lines alone", () => {
    expect(getMarkdownListEdit("ordinary text", 13, 13)).toBeNull();
  });
});
