import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import type { PrIntentRecord } from "@devdigest/shared";

let mockIntent: PrIntentRecord | null = null;
let mockLoading = false;
const mutate = vi.fn();

// Hooks are mocked at IntentCard's own import specifier — unmocked, they'd
// hit the real network (client/AGENTS.md claims fetch is mocked; it isn't).
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: mockIntent, isLoading: mockLoading }),
  useDetectPrIntent: () => ({ mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  mockIntent = null;
  mockLoading = false;
  mutate.mockClear();
});

function renderWithIntl(ui: React.ReactElement, theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the summary and both scope lists when populated", () => {
    mockIntent = {
      pr_id: "pr1",
      intent: "Add a dark mode toggle to Settings",
      in_scope: ["Theme switch UI", "Persist preference"],
      out_of_scope: ["Server-side theming"],
      sources: [{ kind: "title", ref: null, ok: true }],
      missing_context: [],
      head_sha: "abc123",
    };
    renderWithIntl(<IntentCard prId="pr1" headSha="abc123" />);
    expect(screen.getByText(/Add a dark mode toggle to Settings/)).toBeInTheDocument();
    expect(screen.getByText("Theme switch UI")).toBeInTheDocument();
    expect(screen.getByText("Server-side theming")).toBeInTheDocument();
  });

  it("shows a placeholder instead of a blank list when out_of_scope is empty", () => {
    mockIntent = {
      pr_id: "pr1",
      intent: "Fix pagination bug",
      in_scope: ["Pagination fix"],
      out_of_scope: [],
      sources: [],
      missing_context: [],
    };
    renderWithIntl(<IntentCard prId="pr1" headSha={null} />);
    expect(screen.getByText("Nothing explicitly excluded")).toBeInTheDocument();
  });

  it("shows the empty state with a Detect intent action when no intent exists yet", () => {
    mockIntent = null;
    renderWithIntl(<IntentCard prId="pr1" headSha={null} />, "light");
    expect(screen.getByText("Detect intent")).toBeInTheDocument();
  });

  it("renders failed source warnings and missing context when present", () => {
    mockIntent = {
      pr_id: "pr1",
      intent: "Fix auth flow",
      in_scope: ["Login page"],
      out_of_scope: [],
      sources: [
        { kind: "title", ref: null, ok: true },
        { kind: "spec", ref: "docs/specs/auth.md", ok: false },
      ],
      missing_context: ["PR description is empty"],
      head_sha: "abc123",
    };
    renderWithIntl(<IntentCard prId="pr1" headSha="abc123" />);
    expect(screen.getByText(/spec could not be read/)).toBeInTheDocument();
    expect(screen.getByText("PR description is empty")).toBeInTheDocument();
  });
});
