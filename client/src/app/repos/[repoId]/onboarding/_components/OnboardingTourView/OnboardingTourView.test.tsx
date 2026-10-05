/* SPEC-02 Onboarding Tour page (AC-72..AC-103, NFR-8, NFR-9), written from the
   acceptance criteria. Pins what a developer SEES: the title and coverage line,
   the table of contents, the empty state, the honest status banners with their
   exact sentences, the "Outline · no AI" label, the section contents and the
   links at the tour commit. Hooks are mocked at the module boundary; copy comes
   from the real English message file, and the expected sentences are the ones
   quoted in the spec. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingStatus, OnboardingTour, OnboardingTourResponse } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";

const h = vi.hoisted(() => ({
  response: undefined as unknown,
  mutate: vi.fn(),
  isPending: false,
  isLoading: false,
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/payments-api" } }),
}));
vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingTour: () => ({
    data: h.response,
    isLoading: h.isLoading,
    isError: false,
    refetch: vi.fn(),
    dataUpdatedAt: 1,
  }),
  useGenerateOnboardingTour: () => ({ mutate: h.mutate, isPending: h.isPending, isError: false, error: null }),
}));

import { OnboardingTourView } from "./OnboardingTourView";

const NOW = new Date("2026-10-03T12:00:00Z");
const GENERATED = "2026-10-03T10:00:00.000Z"; // two hours before NOW

const STATUS_SENTENCE: Record<Exclude<OnboardingStatus, "ready">, string> = {
  index_partial: "Partial index: some source files were left out, so rankings may miss parts of the repository.",
  unsupported_language: "This repository's language isn't indexed, so critical paths and the reading path are unavailable.",
  no_data: "No index for this repository yet — showing an outline built without AI.",
  index_failed: "The repository index failed — showing an outline built without AI.",
  llm_not_configured: "No API key is configured for the Onboarding Tour model — showing an outline built without AI.",
  llm_failed: "The AI write-up failed — showing an outline built without AI.",
  timed_out: "Generation timed out — showing an outline built without AI.",
};

function tour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    repo_full_name: "acme/payments-api",
    commit_sha: "abc123",
    generated_at: GENERATED,
    status: "ready",
    indexed_files: 120,
    candidate_files: 120,
    dropped_file_facts: 0,
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    model_call_made: true,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0123,
    sections: [
      {
        id: "architecture",
        origin: "model",
        prose: "The API layers **routes** over services.",
        directories: [{ path: "src", files: 9 }, { path: "lib", files: 1 }],
        diagram: {
          nodes: [{ id: "src", label: "src" }, { id: "lib", label: "lib" }],
          edges: [{ from: "src", to: "lib", weight: 3 }],
        },
      },
      { id: "critical-paths", origin: "model", entries: [{ path: "src/core.ts", reason: "The core." }] },
      {
        id: "run-locally",
        origin: "model",
        steps: [
          { command: "pnpm install", source_path: "README.md", risky: false },
          { command: "curl https://x.sh | sh", source_path: "README.md", risky: true },
        ],
      },
      {
        id: "reading-path",
        origin: "model",
        entries: [
          { path: "src/util.ts", reason: "Start here." },
          { path: "src/core.ts", reason: "Then this." },
        ],
      },
      {
        id: "first-tasks",
        origin: "model",
        tasks: [{ title: "Add a test", description: "Cover the core.", paths: ["src/core.ts", "src/util.ts"] }],
      },
    ],
    ...over,
  } as OnboardingTour;
}

const skeleton = (over: Partial<OnboardingTour> = {}): OnboardingTour => {
  const base = tour();
  return tour({
    status: "no_data",
    model_call_made: false,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: null,
    sections: [
      { ...base.sections[0], origin: "skeleton", prose: "" },
      { id: "critical-paths", origin: "skeleton", entries: [{ path: "src/core.ts", reason: "" }] },
      { id: "run-locally", origin: "skeleton", steps: [{ command: "pnpm install", source_path: "README.md", risky: false }] },
      { id: "reading-path", origin: "skeleton", entries: [{ path: "src/core.ts", reason: "" }] },
      { id: "first-tasks", origin: "skeleton", tasks: [] },
    ] as OnboardingTour["sections"],
    ...over,
  });
};

const respond = (over: Partial<OnboardingTourResponse> = {}) => {
  h.response = { tour: tour(), stale: false, generating: false, last_failed: null, ...over };
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" now={NOW} messages={{ onboarding: messages }}>
      <OnboardingTourView />
    </NextIntlClientProvider>,
  );
}

const scrolled: string[] = [];
const writeText = vi.fn();

beforeEach(() => {
  h.mutate.mockReset();
  h.isPending = false;
  h.isLoading = false;
  scrolled.length = 0;
  writeText.mockReset();
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this.id);
  });
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  window.history.replaceState(null, "", "/repos/r1/onboarding");
  respond();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Onboarding Tour page: header (SPEC-02)", () => {
  it("AC-72/AC-73: shows the title with the repo name and the coverage line with the relative time since generation", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Onboarding for acme/payments-api");
    expect(screen.getByText("Generated from index of 120 files · last refreshed 2 hours ago")).toBeTruthy();
  });

  it("AC-72: a stale provider `now` earlier than generated_at never yields 'in ...'; the live clock takes over", () => {
    vi.useFakeTimers();
    // The root-layout provider was rendered 3 minutes before the tour was generated.
    const staleNow = new Date("2026-10-03T09:57:00Z");
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    render(
      <NextIntlClientProvider locale="en" timeZone="UTC" now={staleNow} messages={{ onboarding: messages }}>
        <OnboardingTourView />
      </NextIntlClientProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Generated from index of 120 files · last refreshed 2 hours ago")).toBeTruthy();
    expect(screen.queryByText(/refreshed in /)).toBeNull();
  });

  it("AC-74: when fewer files were indexed than candidates it shows 'Indexed X of Y source files' instead", () => {
    respond({ tour: tour({ indexed_files: 5000, candidate_files: 12450 }) });
    renderView();
    expect(screen.getByText("Indexed 5000 of 12450 source files · last refreshed 2 hours ago")).toBeTruthy();
    expect(screen.queryByText(/Generated from index of/)).toBeNull();
  });

  it("AC-101: shows the model and the estimated cost of a tour that made a model call", () => {
    renderView();
    expect(screen.getByText("Model: deepseek/deepseek-v4-flash · Cost: $0.01")).toBeTruthy();
  });

  it("AC-101: shows 'cost unknown' when the cost is null but a call was made", () => {
    respond({ tour: tour({ cost_usd: null }) });
    renderView();
    expect(screen.getByText("Model: deepseek/deepseek-v4-flash · Cost: cost unknown")).toBeTruthy();
  });

  it("AC-101: shows 'no model call' (and no model name) when no model call was made, even with a configured model", () => {
    respond({ tour: skeleton() });
    renderView();
    expect(screen.getByText("no model call")).toBeTruthy();
    expect(screen.queryByText(/deepseek/)).toBeNull();
    expect(screen.queryByText(/cost unknown/)).toBeNull();
  });

  it("AC-101: a call that cost nothing is not mistaken for 'no model call'", () => {
    respond({ tour: tour({ cost_usd: null, tokens_in: 0, tokens_out: 0, model_call_made: true }) });
    renderView();
    expect(screen.queryByText("no model call")).toBeNull();
  });
});

describe("Onboarding Tour page: table of contents and sharing (SPEC-02)", () => {
  it("AC-75: lists the five sections in tour order under 'On this page'", () => {
    renderView();
    const nav = screen.getByRole("navigation", { name: "Sections of the onboarding tour" });
    expect(within(nav).getByText("On this page")).toBeTruthy();
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Architecture overview",
      "Critical paths",
      "How to run locally",
      "Guided reading path",
      "First tasks",
    ]);
  });

  it("AC-76: selecting an entry scrolls to that section and sets the URL fragment to its anchor", () => {
    renderView();
    fireEvent.click(within(screen.getByRole("navigation")).getByText("Guided reading path"));
    expect(scrolled).toEqual(["reading-path"]);
    expect(window.location.hash).toBe("#reading-path");
    expect(document.getElementById("reading-path")?.tagName).toBe("SECTION");
  });

  it("AC-77: opening the page with a fragment that names a section scrolls to it", () => {
    window.history.replaceState(null, "", "/repos/r1/onboarding#run-locally");
    renderView();
    expect(scrolled).toEqual(["run-locally"]);
  });

  it("AC-77: a fragment that names no section leaves the page at the top", () => {
    window.history.replaceState(null, "", "/repos/r1/onboarding#nope");
    renderView();
    expect(scrolled).toEqual([]);
  });

  it("AC-78/AC-79: Share link copies the absolute URL with the current section anchor and confirms 'Link copied'", () => {
    renderView();
    expect(screen.queryByText("Link copied")).toBeNull();
    fireEvent.click(within(screen.getByRole("navigation")).getByText("How to run locally"));
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding#run-locally`);
    expect(writeText.mock.calls[0]![0]).toMatch(/^https?:\/\/[^/]+\/repos\/r1\/onboarding#run-locally$/);
    expect(screen.getByText("Link copied")).toBeTruthy();
  });

  it("AC-78: with no section selected the copied URL has no anchor", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding`);
  });
});

describe("Onboarding Tour page: empty and generating states (SPEC-02)", () => {
  beforeEach(() => respond({ tour: null }));

  it("AC-80: with no tour and no generation in flight, shows the empty state and its Generate button", () => {
    renderView();
    expect(screen.getAllByText("Generate onboarding tour")).toHaveLength(2); // title and button
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("AC-81: opening the page requests no generation; only clicking the button does, exactly once", () => {
    renderView();
    expect(h.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Generate onboarding tour" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-83: while a generation is in flight the button reads 'Generating…' and is disabled, and clicking it does nothing", () => {
    respond({ tour: null, generating: true });
    renderView();
    const button = screen.getByRole("button", { name: "Generating…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Generate onboarding tour" })).toBeNull();
  });

  it("AC-80: a generation in flight is not an empty state to start another from", () => {
    respond({ tour: null, generating: true });
    renderView();
    expect(screen.queryByText("Generate onboarding tour")).toBeTruthy(); // the title stays
    expect(screen.getAllByText("Generate onboarding tour")).toHaveLength(1);
  });

  it("AC-83: right after the click (request pending) the button is already 'Generating…' and disabled", () => {
    h.isPending = true;
    renderView();
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });
});

describe("Onboarding Tour page: Regenerate (SPEC-02)", () => {
  it("AC-82/AC-81: clicking Regenerate requests a generation; merely showing the tour does not", () => {
    renderView();
    expect(h.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-83: while a generation is in flight Regenerate reads 'Generating…' and is disabled", () => {
    respond({ generating: true });
    renderView();
    const button = screen.getByRole("button", { name: "Generating…" });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
  });
});

describe("Onboarding Tour page: polling timeout banner (SPEC-02)", () => {
  it("AC-85: a generation still in flight 120 s after it was seen replaces polling with the 'taking longer' message", () => {
    vi.useFakeTimers();
    respond({ generating: true });
    renderView();
    const message = "Generation is taking longer than expected. Reload to check again.";
    act(() => void vi.advanceTimersByTime(119_000));
    expect(screen.queryByText(message)).toBeNull();
    act(() => void vi.advanceTimersByTime(2_000));
    expect(screen.getByText(message)).toBeTruthy();
  });
});

describe("Onboarding Tour page: banners (SPEC-02)", () => {
  it("AC-86: a stale tour shows the out-of-date notice; a current one does not", () => {
    respond({ stale: true });
    renderView();
    expect(screen.getByText("Out of date — the index has moved past the commit this tour was built from.")).toBeTruthy();
    cleanup();
    respond({ stale: false });
    renderView();
    expect(screen.queryByText(/Out of date/)).toBeNull();
  });

  it.each(Object.entries(STATUS_SENTENCE))("AC-87: status %s shows exactly its sentence", (status, sentence) => {
    respond({ tour: tour({ status: status as OnboardingStatus }) });
    renderView();
    expect(screen.getByText(sentence, { exact: true })).toBeTruthy();
    // and no other status sentence
    for (const [other, text] of Object.entries(STATUS_SENTENCE)) {
      if (other !== status) expect(screen.queryByText(text, { exact: true })).toBeNull();
    }
  });

  it("AC-87: a ready tour shows no status banner", () => {
    renderView();
    for (const sentence of Object.values(STATUS_SENTENCE)) expect(screen.queryByText(sentence)).toBeNull();
  });

  it("AC-88: llm_not_configured links to /settings/models; other statuses do not", () => {
    respond({ tour: tour({ status: "llm_not_configured" }) });
    renderView();
    expect(screen.getByRole("link", { name: "Open Feature Models settings" })).toHaveAttribute("href", "/settings/models");
    cleanup();
    respond({ tour: tour({ status: "llm_failed" }) });
    renderView();
    expect(screen.queryByRole("link", { name: "Open Feature Models settings" })).toBeNull();
  });

  it("AC-89: a recorded failed regeneration shows its relative time, 'showing the previous tour' and the attempt's status sentence", () => {
    respond({ last_failed: { status: "llm_failed", at: "2026-10-03T09:00:00.000Z" } });
    renderView();
    expect(
      screen.getByText(
        "The last regeneration failed 3 hours ago — showing the previous tour. The AI write-up failed — showing an outline built without AI.",
      ),
    ).toBeTruthy();
  });

  it("AC-89: no failed attempt, no 'last regeneration failed' banner", () => {
    renderView();
    expect(screen.queryByText(/last regeneration failed/)).toBeNull();
  });

  it("AC-88/AC-89: a failed attempt for a missing key also links to /settings/models", () => {
    respond({ last_failed: { status: "llm_not_configured", at: GENERATED } });
    renderView();
    expect(screen.getByRole("link", { name: "Open Feature Models settings" })).toHaveAttribute("href", "/settings/models");
  });
});

describe("Onboarding Tour page: sections (SPEC-02)", () => {
  it("AC-90: every skeleton section heading carries 'Outline · no AI'; model sections do not", () => {
    respond({ tour: skeleton() });
    renderView();
    const sections = ["architecture", "critical-paths", "run-locally", "reading-path", "first-tasks"];
    for (const id of sections) {
      const section = document.getElementById(id)!;
      expect(within(section).getByText("Outline · no AI")).toBeTruthy();
    }
    cleanup();
    respond();
    renderView();
    expect(screen.queryByText("Outline · no AI")).toBeNull();
  });

  it("AC-90: the label is per section: one skeleton section among model sections is the only one labelled", () => {
    const t = tour();
    const sections = [...t.sections] as OnboardingTour["sections"];
    sections[2] = { id: "run-locally", origin: "skeleton", steps: [] };
    respond({ tour: tour({ sections }) });
    renderView();
    expect(screen.getAllByText("Outline · no AI")).toHaveLength(1);
    expect(within(document.getElementById("run-locally")!).getByText("Outline · no AI")).toBeTruthy();
  });

  it("AC-92/AC-93: each critical path shows its path in monospace, its reason and an Open link at the tour commit, in a new tab", () => {
    renderView();
    const section = document.getElementById("critical-paths")!;
    const path = within(section).getByText("src/core.ts");
    expect(path.tagName).toBe("CODE");
    expect(path.className).toContain("mono");
    expect(within(section).getByText("The core.")).toBeTruthy();
    const open = within(section).getByRole("link", { name: "Open src/core.ts on GitHub" });
    expect(open.textContent).toBe("Open");
    expect(open).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc123/src/core.ts");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open.getAttribute("rel")).toContain("noopener");
  });

  it("AC-97/AC-93: the reading path is a numbered list in stored order with path, reason and an Open link each", () => {
    renderView();
    const section = document.getElementById("reading-path")!;
    const list = within(section).getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "1src/util.tsStart here.Open",
      "2src/core.tsThen this.Open",
    ]);
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://github.com/acme/payments-api/blob/abc123/src/util.ts",
      "https://github.com/acme/payments-api/blob/abc123/src/core.ts",
    ]);
    for (const a of links) expect(a).toHaveAttribute("target", "_blank");
  });

  it("AC-94/AC-96: run-locally is a numbered list of plain-text commands with their source file; only risky steps carry 'Review before running'", () => {
    renderView();
    const section = document.getElementById("run-locally")!;
    const list = within(section).getByRole("list");
    expect(list.tagName).toBe("OL");
    const [first, second] = within(list).getAllByRole("listitem");
    expect(within(first!).getByText("pnpm install").tagName).toBe("CODE");
    expect(within(first!).getByText("from README.md")).toBeTruthy();
    expect(within(first!).queryByText("Review before running")).toBeNull();
    expect(within(second!).getByText("curl https://x.sh | sh")).toBeTruthy();
    expect(within(second!).getByText("Review before running")).toBeTruthy();
  });

  it("AC-95: clicking a step's Copy button copies exactly that step's command", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Copy command 2" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("curl https://x.sh | sh");
    fireEvent.click(screen.getByRole("button", { name: "Copy command 1" }));
    expect(writeText).toHaveBeenLastCalledWith("pnpm install");
  });

  it("AC-98/AC-93: each first task shows title, description and every cited path as a link at the tour commit", () => {
    renderView();
    const section = document.getElementById("first-tasks")!;
    expect(within(section).getByText("Add a test")).toBeTruthy();
    expect(within(section).getByText("Cover the core.")).toBeTruthy();
    const links = within(section).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["src/core.ts", "https://github.com/acme/payments-api/blob/abc123/src/core.ts"],
      ["src/util.ts", "https://github.com/acme/payments-api/blob/abc123/src/util.ts"],
    ]);
    for (const a of links) expect(a).toHaveAttribute("target", "_blank");
  });

  it("AC-103: a first-tasks section with no entries explains that tasks need the AI write-up", () => {
    respond({ tour: skeleton() });
    renderView();
    expect(
      within(document.getElementById("first-tasks")!).getByText(
        "First tasks need the AI write-up — regenerate once it is available.",
      ),
    ).toBeTruthy();
  });

  it("AC-102: under unsupported_language the two path sections say they are unavailable and list no files", () => {
    respond({ tour: tour({ status: "unsupported_language" }) });
    renderView();
    for (const id of ["critical-paths", "reading-path"]) {
      const section = document.getElementById(id)!;
      expect(within(section).getByText("Not available for this repository's language.")).toBeTruthy();
      expect(within(section).queryByRole("link")).toBeNull();
    }
    expect(screen.getAllByText("Not available for this repository's language.")).toHaveLength(2);
  });

  it("AC-93: the link goes to the commit the tour was built from, not to a branch", () => {
    respond({ tour: tour({ commit_sha: "deadbeef" }) });
    renderView();
    const hrefs = screen.getAllByRole("link", { name: /Open .* on GitHub/ }).map((a) => a.getAttribute("href")!);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toMatch(/^https:\/\/github\.com\/acme\/payments-api\/blob\/deadbeef\//);
  });
});

describe("Onboarding Tour page: both themes and keyboard reach (SPEC-02)", () => {
  it.each(["dark", "light"] as const)("NFR-8: renders the tour, a banner and the empty state under data-theme=%s", (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    respond({ tour: tour({ status: "llm_not_configured" }), stale: true });
    renderView();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByText(STATUS_SENTENCE.llm_not_configured, { exact: true })).toBeTruthy();
    cleanup();
    respond({ tour: null });
    renderView();
    expect(screen.getByRole("button", { name: "Generate onboarding tour" })).toBeTruthy();
    document.documentElement.removeAttribute("data-theme");
  });

  it("NFR-9: every TOC entry, Open link, Copy, Regenerate and Share control is a natively focusable element (anchor with href or button), none removed from the tab order", () => {
    renderView();
    const controls = [
      ...within(screen.getByRole("navigation")).getAllByRole("link"),
      ...screen.getAllByRole("link", { name: /Open .* on GitHub/ }),
      ...screen.getAllByRole("button", { name: /Copy command/ }),
      screen.getByRole("button", { name: "Regenerate" }),
      screen.getByRole("button", { name: "Share link" }),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(5 + 3 + 2 + 2);
    for (const el of controls) {
      expect(el.getAttribute("tabindex")).not.toBe("-1");
      if (el.tagName === "A") expect(el.getAttribute("href")).toBeTruthy();
      else expect(el.tagName).toBe("BUTTON");
    }
  });
});
