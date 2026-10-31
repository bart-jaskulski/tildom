import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { SettingsContainer, SettingsSection, SettingsRow, SettingsActions } from "./Settings";

describe("Settings layout primitives", () => {
  it("renders container, section, and rows with label and hint", () => {
    render(() => (
      <SettingsContainer>
        <SettingsSection title="generation">
          <SettingsRow label="tone" hint="personality">
            <span data-testid="tone-value">concise</span>
          </SettingsRow>
          <SettingsRow label="actions">
            <SettingsActions>
              <button type="button">save</button>
            </SettingsActions>
          </SettingsRow>
        </SettingsSection>
      </SettingsContainer>
    ));

    expect(screen.getByRole("heading", { name: "generation" })).toBeInTheDocument();
    expect(screen.getByText("tone")).toBeInTheDocument();
    expect(screen.getByText("personality")).toBeInTheDocument();
    expect(screen.getByTestId("tone-value")).toHaveTextContent("concise");
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
  });
});
