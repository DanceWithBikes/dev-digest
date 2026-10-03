/* ProjectContextView — the /repos/:repoId/context page (SPEC-01 AC-40..50, NFR-3).

   The network boundary (`api`) is mocked, the real query hooks run on a real
   QueryClient, so "re-index refreshes the list" and "roots save refreshes the
   list" are proven through the actual cache writes, not through a stubbed hook. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextListing } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: mocks.get, post: mocks.post, put: mocks.put } };
});
vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/shop" } }),
}));
// The shell (sidebar, palette) is out of scope; keep its breadcrumb contract visible.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb?: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <div data-testid="crumb">{(crumb ?? []).map((c) => c.label).join(" / ")}</div>
      {children}
    </div>
  ),
}));

import { ApiError } from "@/lib/api";
import { ProjectContextView } from "./ProjectContextView";

afterEach(cleanup);

const NOW = new Date("2026-10-01T12:00:00Z");

function listing(over: Partial<ContextListing> = {}): ContextListing {
  return {
    repo_id: "r1",
    roots: ["docs/**", "README.md"],
    roots_default: false,
    cloned: true,
    count: 3,
    scanned_at: new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    documents: [
      { path: "docs/specs/b-plan.md", type: "doc", chars: 80, tokens: 20, agents_count: 0, skills_count: 0 },
      { path: "docs/specs/a-auth.md", type: "spec", chars: 400, tokens: 100, agents_count: 2, skills_count: 1 },
      { path: "README.md", type: "doc", chars: 40, tokens: 10, agents_count: 1, skills_count: 0 },
    ],
    ...over,
  };
}

let current: ContextListing;

beforeEach(() => {
  vi.clearAllMocks();
  current = listing();
  mocks.get.mockImplementation(async (path: string) => {
    if (path === "/repos/r1/context") return current;
    if (path.startsWith("/repos/r1/context/file?path=")) {
      return { path: "x", text: "# Auth spec\n\nBody <script>alert(1)</script>", chars: 1, tokens: 1 };
    }
    throw new Error(`unexpected GET ${path}`);
  });
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" now={NOW} messages={{ context: messages }}>
        <ProjectContextView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectContextView — browse, search, preview", () => {
  it("shows the breadcrumb, groups documents by directory with token chips, and the footer", async () => {
    renderView();
    expect(await screen.findByText("a-auth.md")).toBeInTheDocument();
    expect(screen.getByTestId("crumb")).toHaveTextContent("acme/shop / Project Context");

    const tree = screen.getByRole("navigation", { name: "Documents" });
    // One directory header for the two nested files; the root file has none.
    expect(within(tree).getAllByText("docs/specs")).toHaveLength(1);
    const names = within(tree).getAllByRole("button").map((b) => b.textContent);
    // Directory groups sorted ("" first), files sorted by path inside a group.
    expect(names).toEqual(["README.md~10 tokens", "a-auth.md~100 tokens", "b-plan.md~20 tokens"]);

    expect(screen.getByText("Indexed: 3 files · last scanned 3 hours ago")).toBeInTheDocument();
    expect(screen.getByText("Search roots:")).toBeInTheDocument();
    expect(screen.getByText("docs/**")).toBeInTheDocument();
  });

  it("filters by path ignoring case, and says so when nothing matches", async () => {
    renderView();
    await screen.findByText("a-auth.md");
    const search = screen.getByLabelText("Search documents…");

    fireEvent.change(search, { target: { value: "B-PLAN" } });
    const tree = screen.getByRole("navigation", { name: "Documents" });
    expect(within(tree).queryByText("a-auth.md")).toBeNull();
    expect(within(tree).getByText("b-plan.md")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No documents match “zzz”.")).toBeInTheDocument();
  });

  it("renders the selected document read-only with its 'Used by N agents · M skills' header", async () => {
    const { container } = renderView();
    expect(await screen.findByText("Select a document")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /a-auth\.md/ }));
    expect(await screen.findByRole("heading", { name: "Auth spec" })).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents · 1 skill")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith("/repos/r1/context/file?path=docs%2Fspecs%2Fa-auth.md");
    expect(container.querySelector("script")).toBeNull();

    // Singular and zero forms come from the plural message, per document.
    fireEvent.click(screen.getByRole("button", { name: /README\.md/ }));
    expect(screen.getByText("Used by 1 agent · 0 skills")).toBeInTheDocument();
  });
});

describe("ProjectContextView — re-index", () => {
  it("requests a rescan and refreshes the list and footer with its result", async () => {
    mocks.post.mockResolvedValue(
      listing({
        count: 4,
        documents: [
          ...current.documents,
          { path: "docs/new-adr.md", type: "doc", chars: 9, tokens: 3, agents_count: 0, skills_count: 0 },
        ],
      }),
    );
    renderView();
    await screen.findByText("a-auth.md");
    expect(screen.queryByText("new-adr.md")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Re-index" }));

    expect(await screen.findByText("new-adr.md")).toBeInTheDocument();
    expect(mocks.post).toHaveBeenCalledWith("/repos/r1/context/reindex");
    expect(screen.getByText(/Indexed: 4 files/)).toBeInTheDocument();
  });
});

describe("ProjectContextView — search roots", () => {
  it("edits and saves roots one per line, then closes the editor on the re-scanned listing", async () => {
    mocks.put.mockResolvedValue(
      listing({
        roots: ["specs", "adr"],
        count: 1,
        documents: [{ path: "specs/only.md", type: "spec", chars: 1, tokens: 1, agents_count: 0, skills_count: 0 }],
      }),
    );
    renderView();
    await screen.findByText("a-auth.md");

    fireEvent.click(screen.getByRole("button", { name: "Edit search roots" }));
    const box = screen.getByRole("textbox", { name: "Search roots" });
    expect(box).toHaveValue("docs/**\nREADME.md");

    fireEvent.change(box, { target: { value: "specs\n\n  adr  \n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Search roots" })).toBeNull());
    expect(mocks.put).toHaveBeenCalledWith("/repos/r1/context/roots", { roots: ["specs", "adr"] });
    expect(screen.getByText("only.md")).toBeInTheDocument();
    expect(screen.queryByText("a-auth.md")).toBeNull();
  });

  it("shows the server's message from error.details[].params.issue.message on a 422 and keeps the editor open", async () => {
    mocks.put.mockRejectedValue(
      new ApiError("Validation failed", 422, "validation_error", [
        { code: "custom", params: { issue: { message: "Root “../etc” must stay inside the repo" } } },
      ]),
    );
    renderView();
    await screen.findByText("a-auth.md");

    fireEvent.click(screen.getByRole("button", { name: "Edit search roots" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search roots" }), { target: { value: "../etc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Root “../etc” must stay inside the repo");
    expect(screen.queryByText("Validation failed")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Search roots" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Search roots" })).toBeNull();
  });
});

describe("ProjectContextView — empty state", () => {
  it("shows 'No spec files yet' and its 'Edit search roots' action opens the roots editor", async () => {
    current = listing({ count: 0, documents: [], roots_default: true });
    renderView();

    expect(await screen.findByText("No spec files yet")).toBeInTheDocument();
    expect(screen.getByText(/Documents are attached to agents and skills manually/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Documents" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search roots" })).toBeNull();

    // Two entry points exist (roots line + CTA); the CTA is the one inside the empty state.
    const ctas = screen.getAllByRole("button", { name: "Edit search roots" });
    fireEvent.click(ctas[ctas.length - 1]!);
    expect(screen.getByRole("textbox", { name: "Search roots" })).toBeInTheDocument();
  });
});

describe("ProjectContextView — keyboard (NFR-3)", () => {
  // jsdom performs no native key activation and user-event is not installed, so
  // Tab/Space/Enter operability is proven structurally: the control is a native
  // <button> the browser activates on Enter/Space, it is in the tab order, and it
  // takes focus. A div/span with onClick would fail every one of these.
  it("makes Re-index and each document reachable and operable from the keyboard", async () => {
    renderView();
    await screen.findByText("a-auth.md");

    const reindex = screen.getByRole("button", { name: "Re-index" });
    const docBtn = screen.getByRole("button", { name: /a-auth\.md/ });
    for (const el of [reindex, docBtn]) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
      expect(el).toBeEnabled();
      el.focus();
      expect(el).toHaveFocus();
    }

    // Tab order follows the page: Re-index comes before the document list.
    const tabbables = Array.from(document.querySelectorAll<HTMLElement>("button, input, textarea, select, a[href]"));
    expect(tabbables.indexOf(reindex)).toBeLessThan(tabbables.indexOf(docBtn));

    // The key-activated click path selects the document (what Enter/Space dispatch).
    fireEvent.click(docBtn);
    expect(docBtn).toHaveAttribute("aria-current", "true");
  });
});
