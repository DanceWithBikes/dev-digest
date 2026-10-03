/* SPEC-02 model-written text (AC-99, AC-100): rendered as Markdown without
   executing scripts or rendering raw HTML; a link that is not into THIS repo on
   github.com keeps its text but loses the link. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TourMarkdown } from "./TourMarkdown";

afterEach(cleanup);

const renderMd = (text: string) => render(<TourMarkdown fullName="acme/payments-api">{text}</TourMarkdown>);

describe("TourMarkdown", () => {
  it("AC-99: renders Markdown formatting", () => {
    renderMd("Hello **bold** and `code`\n\n- one\n- two");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("AC-99: renders neither script elements nor raw HTML elements, and does not execute event handlers", () => {
    const { container } = renderMd(
      'Before <script>window.__pwned = 1</script> <b>raw bold</b> <img src=x onerror="window.__pwned = 2"> <iframe src="https://evil.example"></iframe> after',
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("AC-100: a link into this repo on github.com stays a link", () => {
    renderMd("See [the core](https://github.com/acme/payments-api/blob/abc/src/core.ts).");
    expect(screen.getByRole("link", { name: "the core" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc/src/core.ts",
    );
  });

  it.each([
    ["another site", "https://evil.example/phish"],
    ["another repo", "https://github.com/other/repo/blob/a/x.ts"],
    ["a look-alike repo", "https://github.com/acme/payments-api-evil/x"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a relative URL", "/settings"],
  ])("AC-100: a link to %s renders its text as plain text without a link", (_n, href) => {
    renderMd(`Go to [click me](${href}) now`);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/click me/)).toBeTruthy();
  });
});
