import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import ConfirmDialog from "./ConfirmDialog"

function setup(props = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      title="Delete this?"
      message="It cannot be undone."
      confirmLabel="Delete it"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  )
  return { onConfirm, onCancel }
}

describe("ConfirmDialog", () => {
  it("asks the question as an alert dialog with its message", () => {
    setup()
    const dialog = screen.getByRole("alertdialog", { name: "Delete this?" })
    expect(dialog).toHaveAccessibleDescription("It cannot be undone.")
  })

  it("starts with Cancel focused, so Enter by reflex deletes nothing", () => {
    setup()
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus()
  })

  it("confirms only when the confirm button is pressed", () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("cancels from the button, from Escape and from a click outside the card", () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.keyDown(document, { key: "Escape" })
    fireEvent.click(screen.getByRole("presentation"))
    expect(onCancel).toHaveBeenCalledTimes(3)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it("does not cancel when the card itself is clicked", () => {
    const { onCancel } = setup()
    fireEvent.click(screen.getByRole("alertdialog"))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("uses the primary style when the action is not destructive, and can be disabled while busy", () => {
    setup({ danger: false, busy: true })
    const confirm = screen.getByRole("button", { name: "Delete it" })
    expect(confirm).toHaveClass("btn-primary")
    expect(confirm).toBeDisabled()
  })
})
