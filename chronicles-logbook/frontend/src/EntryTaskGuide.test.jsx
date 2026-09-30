import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"

import EntryTaskGuide, { ENTRY_DEFINITION, TASK_DEFINITION } from "./EntryTaskGuide"

it("explains the difference in one question, two definitions and how they work together", () => {
  render(<EntryTaskGuide />)
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: /Entry or task\?/ }))

  const dialog = screen.getByRole("dialog", { name: "Entry or task?" })
  expect(within(dialog).getByText(/has it already happened/i)).toBeInTheDocument()
  expect(within(dialog).getByText(ENTRY_DEFINITION)).toBeInTheDocument()
  expect(within(dialog).getByText(TASK_DEFINITION)).toBeInTheDocument()
  expect(within(dialog).getByText(/Fixed the login bug — 2 hours/)).toBeInTheDocument()
  expect(within(dialog).getByText(/Fix the login bug by Friday/)).toBeInTheDocument()
  expect(within(dialog).getByRole("heading", { name: "How they work together" })).toBeInTheDocument()
})

it("closes again", () => {
  render(<EntryTaskGuide />)
  fireEvent.click(screen.getByRole("button", { name: /Entry or task\?/ }))

  fireEvent.click(screen.getByRole("button", { name: "Got it" }))

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})
