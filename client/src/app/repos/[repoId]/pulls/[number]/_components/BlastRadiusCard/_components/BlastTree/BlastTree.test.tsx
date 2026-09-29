import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/blast.json";
import type { DownstreamImpact } from "@devdigest/shared";
import { BlastTree } from "./BlastTree";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ blast: messages }}>{ui}</NextIntlClientProvider>);
}

const DOWNSTREAM: DownstreamImpact[] = [
  {
    symbol: "rateLimit",
    callers: [{ name: "publicRouter", file: "src/a.ts", line: 23 }],
    endpoints_affected: ["GET /api/public/items"],
    crons_affected: ["reset-rate-buckets (hourly)"],
  },
  {
    symbol: "bucketKey",
    callers: [{ name: "rateLimit", file: "src/b.ts", line: 5 }],
    endpoints_affected: [],
    crons_affected: [],
  },
];

describe("BlastTree", () => {
  it("opens the first symbol by default, links a caller to its exact GitHub blob line, and toggles on click", () => {
    renderWithIntl(<BlastTree downstream={DOWNSTREAM} repoFullName="acme/x" headSha="deadbeef" />);

    const firstRow = screen.getByRole("button", { name: /rateLimit/ });
    expect(firstRow).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/a.ts:23")).toHaveAttribute(
      "href",
      "https://github.com/acme/x/blob/deadbeef/src/a.ts#L23",
    );

    const secondRow = screen.getByRole("button", { name: /bucketKey/ });
    expect(secondRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("src/b.ts:5")).not.toBeInTheDocument();

    fireEvent.click(secondRow);
    expect(secondRow).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("src/b.ts:5")).toBeInTheDocument();
  });

  it("renders endpoint and cron chips as distinct, separate groups", () => {
    renderWithIntl(<BlastTree downstream={DOWNSTREAM} repoFullName="acme/x" headSha="deadbeef" />);
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets (hourly)")).toBeInTheDocument();
  });

  it("renders callers as plain text, not a link, when repoFullName or headSha is missing", () => {
    renderWithIntl(<BlastTree downstream={DOWNSTREAM} repoFullName={null} headSha={null} />);
    expect(screen.getByText("src/a.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/a.ts:23" })).not.toBeInTheDocument();
  });
});
