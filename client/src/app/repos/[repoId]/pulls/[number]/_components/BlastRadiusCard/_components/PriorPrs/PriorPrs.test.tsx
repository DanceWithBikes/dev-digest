import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/blast.json";
import type { PrHistory } from "@devdigest/shared";

const state = vi.hoisted(() => ({
  data: undefined as PrHistory | undefined,
  isLoading: false,
  isError: false,
  enabledCalls: [] as boolean[],
}));

// Mocked at PriorPrs's own import specifier — usePriorPrs is only meant to
// fire once the row opens, which this test pins via `enabledCalls`.
vi.mock("../../../../../../../../../lib/hooks/blast", () => ({
  usePriorPrs: (_prId: string | null, enabled: boolean) => {
    state.enabledCalls.push(enabled);
    return { data: state.data, isLoading: state.isLoading, isError: state.isError };
  },
}));

import { PriorPrs } from "./PriorPrs";

afterEach(() => {
  cleanup();
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
  state.enabledCalls = [];
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ blast: messages }}>{ui}</NextIntlClientProvider>);
}

describe("PriorPrs", () => {
  it("stays lazy until opened, then lists the merged PRs that touched these files", () => {
    state.data = {
      history: [
        {
          pr_number: 410,
          title: "Add webhook retry",
          merged_at: "2026-01-05T12:00:00Z",
          author: "octocat",
          files_overlap: ["src/api/public/index.ts"],
          notes: "touched 1 of these files",
        },
      ],
    };
    renderWithIntl(<PriorPrs prId="pr1" repoFullName="acme/payments-api" />);

    // Collapsed: the row title is visible, but usePriorPrs was called with enabled=false.
    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(state.enabledCalls.every((e) => e === false)).toBe(true);
    expect(screen.queryByText("Add webhook retry")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));

    expect(state.enabledCalls.at(-1)).toBe(true);
    expect(screen.getByText("Add webhook retry")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#410" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/pull/410",
    );
  });

  it("shows an inline error without a link, and an empty state when there's nothing to show", () => {
    state.isError = true;
    renderWithIntl(<PriorPrs prId="pr1" repoFullName="acme/payments-api" />);
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("Couldn't load prior PRs.")).toBeInTheDocument();

    cleanup();
    state.isError = false;
    state.data = { history: [] };
    renderWithIntl(<PriorPrs prId="pr1" repoFullName="acme/payments-api" />);
    fireEvent.click(screen.getByRole("button", { name: /Prior PRs touching these files/ }));
    expect(screen.getByText("No prior PRs touched these files.")).toBeInTheDocument();
  });
});
