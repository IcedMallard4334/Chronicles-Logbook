import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { useDialogFocus } from "./useDialogFocus"

function Dialog({ isOpen, onClose, trap, itemCount = 2 }) {
  const dialogRef = useDialogFocus(isOpen, onClose, { trap })
  if (!isOpen) return null
  return (
    <div ref={dialogRef} role="dialog" aria-label="Test dialog" tabIndex={-1}>
      {Array.from({ length: itemCount }, (_, index) => (
        <button key={index} type="button">
          Item {index}
        </button>
      ))}
    </div>
  )
}

function Harness({ trap, itemCount }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog isOpen={open} onClose={() => setOpen(false)} trap={trap} itemCount={itemCount} />
    </div>
  )
}

/** Every real call site passes a fresh inline onClose on every render (none
 * of them memoize with useCallback) — this harness re-renders on every
 * keystroke to reproduce that, the same shape as CreateProjectModal etc. */
function TypingHarness() {
  const [open, setOpen] = useState(true)
  const [text, setText] = useState("")
  const dialogRef = useDialogFocus(open, () => setOpen(false))
  return (
    <div ref={dialogRef} role="dialog" aria-label="Typing dialog" tabIndex={-1}>
      <input
        aria-label="First field"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <input aria-label="Second field" />
    </div>
  )
}

describe("useDialogFocus", () => {
  it("moves focus into the dialog's first focusable element when it opens", () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole("button", { name: "Open" }))

    expect(screen.getByRole("button", { name: "Item 0" })).toHaveFocus()
  })

  it("closes on Escape", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("returns focus to the element that opened it", () => {
    render(<Harness />)
    const openButton = screen.getByRole("button", { name: "Open" })
    // jsdom's fireEvent.click doesn't move focus the way a real browser
    // click does, so focus the trigger explicitly first — matching what a
    // keyboard user (Tab to the button, then Enter/Space) actually does.
    openButton.focus()
    fireEvent.click(openButton)

    fireEvent.keyDown(document, { key: "Escape" })

    expect(openButton).toHaveFocus()
  })

  it("traps Tab within the dialog by default: Tab from the last item wraps to the first", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    screen.getByRole("button", { name: "Item 1" }).focus()

    fireEvent.keyDown(document, { key: "Tab" })

    expect(screen.getByRole("button", { name: "Item 0" })).toHaveFocus()
  })

  it("traps Shift+Tab from the first item back to the last", () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    // The hook already focused Item 0 on open.

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true })

    expect(screen.getByRole("button", { name: "Item 1" })).toHaveFocus()
  })

  it("does not trap Tab when trap is false, for a non-modal popover", () => {
    render(<Harness trap={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    screen.getByRole("button", { name: "Item 1" }).focus()

    fireEvent.keyDown(document, { key: "Tab" })

    // No preventDefault / no forced refocus: the browser's own Tab order
    // takes over, which this test can only confirm indirectly by checking
    // focus was *not* pulled back to Item 0.
    expect(screen.getByRole("button", { name: "Item 0" })).not.toHaveFocus()
  })

  it("does not throw when the dialog has no focusable children", () => {
    render(<Harness itemCount={0} />)

    expect(() => fireEvent.click(screen.getByRole("button", { name: "Open" }))).not.toThrow()
    expect(screen.getByRole("dialog")).toHaveFocus()
  })

  it("does not re-steal focus back to the first field on every keystroke, even though onClose is a fresh function every render", () => {
    render(<TypingHarness />)
    const second = screen.getByRole("textbox", { name: "Second field" })
    second.focus()

    fireEvent.change(screen.getByRole("textbox", { name: "First field" }), {
      target: { value: "hello" },
    })

    expect(second).toHaveFocus()
  })
})
