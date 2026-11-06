import { test, expect } from "@playwright/test";

test.describe("Kin Acceptance Tests (Local-First & Behavioral)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for local database directory to initialize and loading status to detach
    await expect(page.getByRole("status")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "add person" })).toBeVisible();
  });

  test("manages contact lifecycle: full profile details with birth date, tagged entries with custom date, tag filtering, and search", async ({ page }) => {
    // 1. Add contact via modal dialog
    await page.getByRole("button", { name: "add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder("e.g. Mum / Alex from climbing").fill("Grace Hopper");
    await dialog.getByRole("button", { name: "add record" }).click();
    await expect(dialog).not.toBeVisible();

    // 2. Automatically routed to person detail page (/person/grace-hopper)
    await expect(page).toHaveURL(/\/person\/grace-hopper/);
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();

    // 3. Edit and fill all details for the contact
    await page.getByRole("button", { name: "[ edit ]" }).click();
    const editForm = page.locator("form").filter({ hasText: "Edit profile" });
    await expect(editForm).toBeVisible();

    await editForm.getByLabel("Relationship", { exact: true }).fill("colleague");
    await editForm.getByLabel("Location", { exact: true }).fill("Arlington, VA");
    await editForm.getByLabel("Email", { exact: true }).fill("grace.hopper@navy.mil");
    await editForm.getByLabel("Phone", { exact: true }).fill("+1 703 555 0199");

    // Setting birth date with day, month, and year (verifying day + month are retained and saved)
    await editForm.getByLabel("Birthday day").selectOption("9");
    await editForm.getByLabel("Birthday month").selectOption("12");
    await editForm.getByLabel("Birthday year").fill("1906");

    await editForm.getByRole("button", { name: "save" }).click();
    await expect(editForm).not.toBeVisible();

    // Verify observable profile details
    await expect(page.getByText("[ colleague ]")).toBeVisible();
    await expect(page.getByText("Arlington, VA")).toBeVisible();
    await expect(page.getByText("grace.hopper@navy.mil")).toBeVisible();
    await expect(page.getByText("+1 703 555 0199")).toBeVisible();
    await expect(page.getByText(/December 9, 1906|9 December 1906/i)).toBeVisible();

    // Local-First Invariant: hard reload browser and verify OPFS SQLite persistence of all details
    await page.reload();
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();
    await expect(page.getByText("[ colleague ]")).toBeVisible();
    await expect(page.getByText("Arlington, VA")).toBeVisible();
    await expect(page.getByText("grace.hopper@navy.mil")).toBeVisible();
    await expect(page.getByText("+1 703 555 0199")).toBeVisible();
    await expect(page.getByText(/December 9, 1906|9 December 1906/i)).toBeVisible();

    // 4. Add first entry with #compiler tag
    const editor = page.locator("#new-note .cm-content");
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.fill("Discussed early compiler designs and #compiler architecture");
    await page.getByRole("button", { name: "add entry" }).click();

    const timeline = page.getByLabel("Grace Hopper timeline");
    await expect(timeline.getByText("Discussed early compiler designs and #compiler architecture")).toBeVisible();
    const sidebar = page.getByRole("complementary");
    await expect(sidebar.getByRole("button", { name: "#compiler" })).toBeVisible();

    // 5. Add second entry with another tag (#nanoseconds) and a custom date
    await editor.click();
    await editor.fill("Demonstrated physical wire length of #nanoseconds at conference");
    const composerForm = page.locator("form").filter({ has: page.locator("#new-note") });
    await composerForm.locator('input[type="date"]').fill("2024-05-15");
    await page.getByRole("button", { name: "add entry" }).click();

    await expect(timeline.getByText("Demonstrated physical wire length of #nanoseconds at conference")).toBeVisible();
    await expect(timeline.getByText(/May 15, 2024|15 May 2024/i)).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "#nanoseconds" })).toBeVisible();

    // 6. Select particular tag to be visible on entry list
    await sidebar.getByRole("button", { name: "#nanoseconds" }).click();
    await expect(timeline.getByText("Demonstrated physical wire length of #nanoseconds at conference")).toBeVisible();
    await expect(timeline.getByText("Discussed early compiler designs and #compiler architecture")).not.toBeVisible();

    // Clear tag filter: verify all entries become visible again
    await sidebar.getByRole("button", { name: "[ clear ]" }).click();
    await expect(timeline.getByText("Demonstrated physical wire length of #nanoseconds at conference")).toBeVisible();
    await expect(timeline.getByText("Discussed early compiler designs and #compiler architecture")).toBeVisible();

    // 7. Use search to find detail from second entry for that person
    await page.getByRole("link", { name: /people\.db/i }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("status")).not.toBeVisible();

    const searchInput = page.locator("[data-kin-search]");
    await searchInput.fill("nanoseconds");

    // Contact row appears with match highlight from the second timeline entry
    const personRow = page.locator("[data-person-row]").filter({ hasText: "Grace Hopper" });
    await expect(personRow).toBeVisible();
    await expect(personRow.getByText(/nanoseconds/i)).toBeVisible();

    // Clicking match navigates back to contact page
    await personRow.locator("button").first().click();
    await expect(page).toHaveURL(/\/person\/grace-hopper/);
    await expect(page.getByRole("heading", { name: "Grace Hopper" })).toBeVisible();
  });

  test("maps symmetrical relationships between contacts and persists across reload", async ({ page }) => {
    // Helper to create a person from the home directory
    const addPerson = async (name: string) => {
      await page.goto("/");
      await expect(page.getByRole("status")).not.toBeVisible();
      await page.getByRole("button", { name: "add person" }).click();
      const dialog = page.getByRole("dialog", { name: "Add person" });
      await dialog.getByPlaceholder("e.g. Mum / Alex from climbing").fill(name);
      await dialog.getByRole("button", { name: "add record" }).click();
      await expect(dialog).not.toBeVisible();
    };

    // 1. Create two contacts so relationships can be formed
    await addPerson("Grace Hopper");
    await addPerson("Ada Lovelace");
    await expect(page).toHaveURL(/\/person\/ada-lovelace/);

    // 2. Add relationship: Ada Lovelace is mentor to Grace Hopper
    const addRelationshipButton = page.getByRole("button", { name: "[ add ]" });
    await expect(addRelationshipButton).toBeVisible();
    await addRelationshipButton.click();

    await page.getByLabel("Related person").selectOption({ label: "Grace Hopper" });
    await page.getByLabel("Relationship type").fill("mentor");
    await page.getByRole("button", { name: "save" }).click();

    // 3. Verify on Ada's page: relationship shows Mentor: Grace Hopper
    await expect(page.getByText("Mentor: Grace Hopper")).toBeVisible();

    // 4. Navigate to Grace Hopper's page: verify inverse role Mentee: Ada Lovelace is rendered!
    await page.goto("/");
    await expect(page.getByRole("status")).not.toBeVisible();
    await page.locator("[data-person-row]").filter({ hasText: "Grace Hopper" }).click();
    await expect(page.getByText("Mentee: Ada Lovelace")).toBeVisible();

    // 5. Local-First Invariant: reload and verify reciprocal link persisted in SQLite
    await page.reload();
    await expect(page.getByText("Mentee: Ada Lovelace")).toBeVisible();
  });
});
