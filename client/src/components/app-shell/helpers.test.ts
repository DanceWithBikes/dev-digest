/* SPEC-02 sidebar (AC-69, AC-70, AC-71): the Onboarding Tour entry sits in
   WORKSPACE after Project Context, is active only on the per-repo tour page, and
   is NOT active on the add-repository screen `/onboarding`. */
import { describe, it, expect } from "vitest";
import { NAV, resolveHref } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor (Onboarding Tour)", () => {
  it("AC-70: highlights the Onboarding Tour entry on /repos/:repoId/onboarding", () => {
    expect(activeKeyFor("/repos/r1/onboarding")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/0b1f-22/onboarding/")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding/extra")).toBe("onboarding-tour");
  });

  it("AC-71: does not highlight it on the add-repository screen /onboarding", () => {
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding/")).not.toBe("onboarding-tour");
    expect(activeKeyFor("/onboarding/anything")).not.toBe("onboarding-tour");
  });

  it("AC-70: does not steal the highlight from neighbouring entries", () => {
    expect(activeKeyFor("/repos/r1/context")).toBe("context");
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
    expect(activeKeyFor("/repos/r1/conventions")).toBe("conventions");
  });
});

describe("sidebar nav (Onboarding Tour)", () => {
  it("AC-69: the WORKSPACE group lists Onboarding Tour right after Project Context", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE")!;
    const labels = workspace.items.map((i) => i.label);
    expect(labels.indexOf("Onboarding Tour")).toBe(labels.indexOf("Project Context") + 1);
  });

  it("AC-69: the entry leads to /repos/:repoId/onboarding for the active repo", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.label === "Onboarding Tour")!;
    expect(resolveHref(item.href, "r42")).toBe("/repos/r42/onboarding");
    expect(item.key).toBe(activeKeyFor("/repos/r42/onboarding"));
  });
});

describe("sidebar nav (Eval Dashboard)", () => {
  it("lists the eval entry at /eval with the g e shortcut", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "eval")!;
    expect(item.href).toBe("/eval");
    expect(item.gKey).toBe("e");
  });
});
