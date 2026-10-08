import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders a single point without NaN coordinates", () => {
    const { container } = render(<Sparkline data={[0.8]} w={56} h={20} />);
    expect(container.querySelector("path")!.getAttribute("d")).not.toContain("NaN");
    expect(container.querySelector("circle")!.getAttribute("cx")).toBe("28");
  });

  it("renders nothing for empty data", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
