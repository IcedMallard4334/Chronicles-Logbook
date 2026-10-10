import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import FormField, { CharacterCount, ShortTextBox } from "./FormField"

describe("FormField", () => {
  it("names the box it holds, with the type beside the name", () => {
    render(
      <FormField label="Notes" typeLabel="Long text" size="long">
        {(props) => <textarea {...props} />}
      </FormField>
    )

    const box = screen.getByLabelText("Notes")
    expect(box.tagName).toBe("TEXTAREA")
    expect(screen.getByText("Long text")).toBeInTheDocument()
    // The type is part of how the box is described to assistive technology.
    expect(box).toHaveAccessibleDescription("Long text")
  })

  it("marks a required field with an asterisk the label itself does not carry", () => {
    render(
      <FormField label="Title" typeLabel="Short text" required>
        {(props) => <input {...props} />}
      </FormField>
    )

    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-required", "true")
    expect(document.querySelector(".form-field-required")).toHaveAttribute("aria-hidden", "true")
  })

  it("does not mark an optional field required", () => {
    render(<FormField label="Notes">{(props) => <input {...props} />}</FormField>)

    expect(screen.getByLabelText("Notes")).not.toHaveAttribute("aria-required")
    expect(document.querySelector(".form-field-required")).toBeNull()
  })

  it("shows a hint, and an error that marks the box invalid", () => {
    render(
      <FormField label="Name" hint="As on the door" error="Give it a name.">
        {(props) => <input {...props} />}
      </FormField>
    )

    const box = screen.getByLabelText("Name")
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription("As on the door Give it a name.")
    expect(document.querySelector(".form-field")).toHaveClass("has-error")
  })

  it("counts characters against the limit", () => {
    render(
      <FormField label="Title" count={{ length: 12, max: 255 }}>
        {(props) => <input {...props} />}
      </FormField>
    )

    expect(screen.getByText("12 / 255")).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("12 / 255")
  })

  it("labels a field made of several controls as a group", () => {
    render(
      <FormField group label="Labels" typeLabel="Tags">
        <button type="button">one</button>
        <button type="button">two</button>
      </FormField>
    )

    const group = screen.getByRole("group", { name: "Labels" })
    expect(group).toHaveAccessibleDescription("Tags")
    expect(group).toContainElement(screen.getByRole("button", { name: "one" }))
  })

  it("accepts plain children as well as a function", () => {
    render(<FormField label="Result"><output>42</output></FormField>)

    expect(screen.getByText("42")).toBeInTheDocument()
  })
})

describe("CharacterCount", () => {
  it("turns amber near the limit and red above it", () => {
    const { rerender } = render(<CharacterCount length={10} max={100} />)
    expect(screen.getByText("10 / 100")).not.toHaveClass("is-near", "is-over")

    rerender(<CharacterCount length={95} max={100} />)
    expect(screen.getByText("95 / 100")).toHaveClass("is-near")

    rerender(<CharacterCount length={101} max={100} />)
    expect(screen.getByText("101 / 100")).toHaveClass("is-over")
  })

  it("writes thousands with separators", () => {
    render(<CharacterCount length={1200} max={5000} />)

    expect(screen.getByText("1,200 / 5,000")).toBeInTheDocument()
  })
})

describe("ShortTextBox", () => {
  function Harness({ onSubmit = () => {} }) {
    const [value, setValue] = useState("")
    return (
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(value) }}>
        <ShortTextBox aria-label="Place" value={value} onValueChange={setValue} />
      </form>
    )
  }

  it("is a one-row box that resizes itself to its text, so nothing scrolls sideways", () => {
    render(<Harness />)
    const box = screen.getByLabelText("Place")
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 64 })

    fireEvent.change(box, { target: { value: "a long answer ".repeat(10) } })

    expect(box).toHaveAttribute("rows", "1")
    expect(box.style.height).toBe("64px")
  })

  it("keeps a pasted line break out of the answer", () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "one\ntwo\r\nthree" } })

    expect(screen.getByLabelText("Place")).toHaveValue("one two three")
  })

  it("submits the form on Enter, like a one-line box, instead of adding a line", () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText("Place"), { target: { value: "The lake" } })

    fireEvent.keyDown(screen.getByLabelText("Place"), { key: "Enter" })

    expect(onSubmit).toHaveBeenCalledWith("The lake")
  })

  it("leaves other keys alone", () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)

    fireEvent.keyDown(screen.getByLabelText("Place"), { key: "a" })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
