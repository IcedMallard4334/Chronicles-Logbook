import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import MiraMarkdown, { parseBlocks } from "./MiraMarkdown"

describe("MiraMarkdown", () => {
  it("renders bold, italic and inline code", () => {
    const { container } = render(<MiraMarkdown text="Use **bold** and *italic* with `code`." />)
    expect(container.querySelector("strong")).toHaveTextContent("bold")
    expect(container.querySelector("em")).toHaveTextContent("italic")
    expect(container.querySelector("code")).toHaveTextContent("code")
    expect(container).not.toHaveTextContent("**")
  })

  it("renders bullet and numbered lists and headings", () => {
    const { container } = render(<MiraMarkdown text={"## Plan\n- one\n- two\n\n1. first\n2. second"} />)
    expect(screen.getByRole("heading", { name: "Plan" })).toBeInTheDocument()
    expect(container.querySelectorAll("ul li")).toHaveLength(2)
    expect(container.querySelectorAll("ol li")).toHaveLength(2)
  })

  it("keeps code fences literal", () => {
    const { container } = render(<MiraMarkdown text={"```\nconst a = **1**\n```"} />)
    expect(container.querySelector("pre code")).toHaveTextContent("const a = **1**")
    expect(container.querySelector("strong")).toBeNull()
  })

  it("never turns Mira's text into markup", () => {
    const { container } = render(<MiraMarkdown text={"<img src=x onerror=alert(1)> [link](http://evil.test)"} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>")
  })

  it("shows half-written emphasis as plain text while a reply is still streaming", () => {
    const { container } = render(<MiraMarkdown text="This is **bol" />)
    expect(container.querySelector("strong")).toBeNull()
    expect(container).toHaveTextContent("This is **bol")
  })

  it("separates paragraphs on blank lines and keeps single line breaks", () => {
    const blocks = parseBlocks("a\nb\n\nc")
    expect(blocks).toEqual([{ type: "p", lines: ["a", "b"] }, { type: "p", lines: ["c"] }])
  })

  it("closes an unterminated code fence", () => {
    expect(parseBlocks("```\nopen")).toEqual([{ type: "code", text: "open" }])
  })
})
