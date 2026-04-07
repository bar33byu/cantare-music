import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import KnowledgeBar from "./KnowledgeBar";

describe("KnowledgeBar", () => {
  it("renders with 0% width when percent is 0", () => {
    render(<KnowledgeBar percent={0} />);
    const fill = screen.getByTestId("knowledge-bar-fill");
    expect(fill).toHaveStyle({ width: "0%" });
  });

  it("renders with 60% width when percent is 60", () => {
    render(<KnowledgeBar percent={60} />);
    const fill = screen.getByTestId("knowledge-bar-fill");
    expect(fill).toHaveStyle({ width: "60%" });
  });

  it("renders label text when provided", () => {
    render(<KnowledgeBar percent={50} label="Knowledge Level" />);
    expect(screen.getByText("Knowledge Level")).toBeInTheDocument();
  });

  it("does not render label element when label is omitted", () => {
    render(<KnowledgeBar percent={50} />);
    const label = screen.queryByTestId("knowledge-bar-label");
    expect(label).toBeNull();
  });

  it("sets aria-valuenow based on percent prop", () => {
    render(<KnowledgeBar percent={75} />);
    const outer = screen.getByRole("progressbar");
    expect(outer).toHaveAttribute("aria-valuenow", "75");
  });

  it("renders memorization percentage text inside the bar", () => {
    render(<KnowledgeBar percent={63.4} />);
    expect(screen.getByTestId("knowledge-bar-percent")).toHaveTextContent("63% memorized");
  });
});
