import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({ running: false }));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: state.running }),
}));

import { RunStatus } from "./RunStatus";

afterEach(() => {
  cleanup();
  state.running = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunStatus (smoke)", () => {
  it("renders nothing when there are no run ids", () => {
    const { container } = renderWithIntl(<RunStatus runIds={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("splits the header into running and queued agents while some wait their turn", () => {
    state.running = true;
    renderWithIntl(<RunStatus runIds={["r1", "r2", "r3"]} queuedCount={2} />);
    expect(screen.getByText("Running · 1 agent(s) · 2 queued")).toBeInTheDocument();
  });

  it("counts every run as running when none are queued", () => {
    state.running = true;
    renderWithIntl(<RunStatus runIds={["r1", "r2"]} />);
    expect(screen.getByText("Running · 2 agent(s)")).toBeInTheDocument();
  });
});
