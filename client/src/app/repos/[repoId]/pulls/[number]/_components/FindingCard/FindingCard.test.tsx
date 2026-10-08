import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

// Boundary mock: a tiny stateful stand-in for the react-query mutation so the
// card can flip idle -> pending -> success/error without a QueryClient.
const evalApi = vi.hoisted(() => ({
  request: vi.fn<(vars: { findingId: string }) => Promise<{ owner_id: string }>>(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../../../../../../../lib/hooks/evals", async () => {
  const React = await import("react");
  return {
    useCreateEvalCaseFromFinding: () => {
      const [state, setState] = React.useState<{ data?: { owner_id: string }; isPending: boolean }>({
        isPending: false,
      });
      return {
        ...state,
        mutate: (
          vars: { findingId: string },
          opts?: { onSuccess?: () => void; onError?: (e: Error) => void },
        ) => {
          setState({ isPending: true });
          evalApi.request(vars).then(
            (data) => {
              setState({ data, isPending: false });
              opts?.onSuccess?.();
            },
            (e: Error) => {
              setState({ isPending: false });
              opts?.onError?.(e);
            },
          );
        },
      };
    },
  };
});
vi.mock("../../../../../../../lib/toast", () => ({
  notify: { success: evalApi.success, error: evalApi.error },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard turn into eval case", () => {
  const ACCEPTED = { ...FINDING, accepted_at: "2026-01-01T00:00:00Z" };
  const turnInto = () => screen.getByRole("button", { name: /turn into eval case/i });

  (["dark", "light"] as const).forEach((theme) => {
    it(`is disabled with a hint until decided, then creates the case and links to Evals (${theme})`, async () => {
      let resolve!: (v: { owner_id: string }) => void;
      evalApi.request.mockReturnValue(new Promise((r) => (resolve = r)));

      const { rerender } = renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(turnInto()).toBeDisabled();
      expect(turnInto()).toHaveAttribute("title", messages.finding.evalNeedsDecision);
      expect(screen.getByText(messages.finding.evalNeedsDecision)).toBeVisible();

      rerender(
        <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
          <div data-theme={theme}>
            <FindingCard f={ACCEPTED} defaultExpanded onAction={() => {}} />
          </div>
        </NextIntlClientProvider>,
      );
      expect(turnInto()).toBeEnabled();
      expect(screen.queryByText(messages.finding.evalNeedsDecision)).not.toBeInTheDocument();

      fireEvent.click(turnInto());
      expect(evalApi.request).toHaveBeenCalledWith({ findingId: "f1" });
      expect(turnInto()).toBeDisabled(); // pending: no double submit

      resolve({ owner_id: "agent-9" });
      const link = await screen.findByRole("link", { name: /open in evals/i });
      expect(link).toHaveAttribute("href", "/agents/agent-9?tab=evals");
      expect(evalApi.success).toHaveBeenCalledWith(messages.finding.evalCreated);
      expect(screen.queryByRole("button", { name: /turn into eval case/i })).not.toBeInTheDocument();
    });
  });

  it("toasts the server message and keeps the button on error", async () => {
    evalApi.request.mockRejectedValue(new Error("Finding has no agent"));
    renderWithIntl(<FindingCard f={ACCEPTED} defaultExpanded onAction={() => {}} />);

    fireEvent.click(turnInto());
    await waitFor(() => expect(evalApi.error).toHaveBeenCalledWith("Finding has no agent"));
    expect(turnInto()).toBeEnabled();
    expect(screen.queryByRole("link", { name: /open in evals/i })).not.toBeInTheDocument();
  });
});
