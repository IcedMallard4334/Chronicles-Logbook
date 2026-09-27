/**
 * The project's Automation tab (US-3.12): an owner can write a rule that runs
 * on new entries, switch it off, and remove it; a member can read the rules
 * but not change them; repeating entries are listed with when they next run.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchRules: vi.fn(),
  fetchRecurrences: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}))

import AutomationPanel from "./AutomationPanel"
import { createRule, deleteRule, fetchRecurrences, fetchRules, updateRule } from "./api"

const SCHEMA = [
  { id: "f-summary", name: "Summary", type: "text" },
  { id: "f-kind", name: "Kind", type: "dropdown", options: ["Bug", "Feature"] },
  { id: "f-tags", name: "Tags", type: "tags" },
]

const project = {
  id: "p1",
  name: "Bugs",
  entry_schema: SCHEMA,
  entries: [{ id: "e1", title: "Weekly review", data: {}, created_at: "2026-09-01T00:00:00Z" }],
}

const rule = {
  id: "r1",
  project_id: "p1",
  name: "Triage bugs",
  enabled: true,
  match: "all",
  conditions: [{ field_id: "f-kind", operator: "equals", value: "Bug" }],
  actions: [{ type: "add_tags", field_id: "f-tags", tags: ["triage"] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchRules.mockResolvedValue([rule])
  fetchRecurrences.mockResolvedValue([
    {
      id: "rec1",
      entry_id: "e1",
      frequency: "weekly",
      interval: 1,
      starts_on: "2026-09-01",
      ends_on: null,
      next_on: "2026-10-06",
      active: true,
      occurrences_created: 4,
    },
  ])
})

describe("the automation tab", () => {
  it("shows each rule as a sentence", async () => {
    render(<AutomationPanel project={project} />)

    expect(await screen.findByText("Triage bugs")).toBeInTheDocument()
    expect(screen.getByText("When Kind is Bug: add tag triage to Tags.")).toBeInTheDocument()
    expect(screen.getByText("On")).toBeInTheDocument()
  })

  it("lists repeating entries with when they next run", async () => {
    render(<AutomationPanel project={project} />)

    expect(await screen.findByText("Weekly review")).toBeInTheDocument()
    expect(screen.getByText(/Repeats every week · next on .*2026 · 4 copies so far/)).toBeInTheDocument()
  })

  it("lets the owner write a new rule", async () => {
    fetchRules.mockResolvedValue([])
    createRule.mockResolvedValue({ ...rule, id: "r2", name: "Tag everything" })
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "+ New rule" }))
    const form = screen.getByRole("form", { name: "New rule" })
    fireEvent.change(within(form).getByLabelText("Rule name"), { target: { value: "Tag everything" } })
    fireEvent.change(within(form).getByLabelText("Tags to add"), { target: { value: "logged, new" } })
    fireEvent.click(within(form).getByRole("button", { name: "Save rule" }))

    await waitFor(() =>
      expect(createRule).toHaveBeenCalledWith("p1", {
        name: "Tag everything",
        enabled: true,
        match: "all",
        conditions: [],
        actions: [{ type: "add_tags", field_id: "f-tags", tags: ["logged", "new"] }],
      })
    )
    expect(await screen.findByText("Tag everything")).toBeInTheDocument()
    expect(screen.queryByRole("form", { name: "New rule" })).toBeNull()
  })

  it("can switch to filling a field, with a value picked from its options", async () => {
    fetchRules.mockResolvedValue([])
    createRule.mockResolvedValue(rule)
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "+ New rule" }))
    const form = screen.getByRole("form", { name: "New rule" })
    fireEvent.change(within(form).getByLabelText("Rule name"), { target: { value: "Default kind" } })
    fireEvent.change(within(form).getByLabelText("Then"), { target: { value: "set_field" } })
    fireEvent.change(within(form).getByLabelText("Field"), { target: { value: "f-kind" } })
    fireEvent.change(within(form).getByLabelText("Value"), { target: { value: "Feature" } })
    fireEvent.click(within(form).getByRole("button", { name: "Save rule" }))

    await waitFor(() => expect(createRule).toHaveBeenCalled())
    expect(createRule.mock.lastCall[1].actions).toEqual([
      { type: "set_field", field_id: "f-kind", value: "Feature", overwrite: false },
    ])
  })

  it("explains what's missing instead of sending an incomplete rule", async () => {
    fetchRules.mockResolvedValue([])
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "+ New rule" }))
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Give the rule a name.")
    expect(createRule).not.toHaveBeenCalled()
  })

  it("shows the server's reason when a rule is refused", async () => {
    fetchRules.mockResolvedValue([])
    createRule.mockRejectedValue(new Error("'Urgent' is not an option"))
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "+ New rule" }))
    fireEvent.change(screen.getByLabelText("Rule name"), { target: { value: "X" } })
    fireEvent.change(screen.getByLabelText("Tags to add"), { target: { value: "a" } })
    fireEvent.click(screen.getByRole("button", { name: "Save rule" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("'Urgent' is not an option")
  })

  it("switches a rule off without losing it", async () => {
    updateRule.mockResolvedValue({ ...rule, enabled: false })
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }))

    await waitFor(() =>
      expect(updateRule).toHaveBeenCalledWith("p1", "r1", {
        name: "Triage bugs",
        match: "all",
        conditions: rule.conditions,
        actions: rule.actions,
        enabled: false,
      })
    )
    expect(await screen.findByText("Off")).toBeInTheDocument()
  })

  it("edits an existing rule in place", async () => {
    updateRule.mockResolvedValue({ ...rule, name: "Renamed" })
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
    const form = screen.getByRole("form", { name: "Edit rule" })
    expect(within(form).getByLabelText("Rule name")).toHaveValue("Triage bugs")
    fireEvent.change(within(form).getByLabelText("Rule name"), { target: { value: "Renamed" } })
    fireEvent.click(within(form).getByRole("button", { name: "Save rule" }))

    expect(await screen.findByText("Renamed")).toBeInTheDocument()
    expect(updateRule.mock.lastCall[2].name).toBe("Renamed")
  })

  it("asks before deleting a rule", async () => {
    deleteRule.mockResolvedValue(null)
    render(<AutomationPanel project={project} />)

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))
    expect(screen.getByText("Delete this rule?")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith("p1", "r1"))
    await waitFor(() => expect(screen.queryByText("Triage bugs")).toBeNull())
  })

  it("lets a member read the rules but not change them", async () => {
    render(<AutomationPanel project={{ ...project, shared: true }} />)

    expect(await screen.findByText("Triage bugs")).toBeInTheDocument()
    expect(screen.getByText(/Only the project.s owner can change its rules/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "+ New rule" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
  })

  it("says so when there is nothing yet", async () => {
    fetchRules.mockResolvedValue([])
    fetchRecurrences.mockResolvedValue([])
    render(<AutomationPanel project={project} />)

    expect(await screen.findByText("No rules yet.")).toBeInTheDocument()
    expect(screen.getByText("No entries repeat yet.")).toBeInTheDocument()
  })

  it("asks for fields first when the project has no schema", async () => {
    fetchRules.mockResolvedValue([])
    render(<AutomationPanel project={{ ...project, entry_schema: [] }} />)

    expect(await screen.findByText(/Add some fields in the Schema tab first/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "+ New rule" })).toBeNull()
  })

  it("reports a failure to load", async () => {
    fetchRules.mockRejectedValue(new Error("Cannot reach the Chronicles API."))
    render(<AutomationPanel project={project} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach the Chronicles API.")
  })
})
