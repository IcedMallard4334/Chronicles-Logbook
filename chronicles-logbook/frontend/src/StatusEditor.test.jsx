import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import StatusEditor, { statusProblem } from "./StatusEditor"
import StatusPicker from "./StatusPicker"
import { customStatusNames, hasCustomStatuses, projectStatuses, statusFilterCriteria, statusFilterParams, statusFilterValue, statusOf } from "./statuses"

const custom = {
  statuses: [
    { name: "Backlog", done: false },
    { name: "Blocked", done: false },
    { name: "Done", done: true },
  ],
}

describe("status helpers", () => {
  it("falls back to the default pair and recognises customised projects", () => {
    expect(projectStatuses({}).map((s) => s.name)).toEqual(["Still to do", "Done"])
    expect(hasCustomStatuses({})).toBe(false)
    expect(hasCustomStatuses(custom)).toBe(true)
  })

  it("reads an entry's status, tolerating rows with none or a stale name", () => {
    expect(statusOf({ status: "Blocked", todo: true }, custom)).toBe("Blocked")
    expect(statusOf({ todo: true }, custom)).toBe("Backlog")
    expect(statusOf({ status: "Gone", todo: false }, custom)).toBe("Done")
  })

  it("lists each custom status name once, leaving out the built-in pair", () => {
    expect(customStatusNames([custom, custom, {}])).toEqual(["Backlog", "Blocked"])
  })

  it("translates the filter control to request params, saved criteria and back", () => {
    expect(statusFilterParams("")).toEqual({})
    expect(statusFilterParams("true")).toEqual({ todo: true })
    expect(statusFilterParams("false")).toEqual({ todo: false })
    expect(statusFilterParams("status:Blocked")).toEqual({ status: "Blocked" })
    expect(statusFilterCriteria("status:Blocked")).toEqual({ todo: null, status: "Blocked" })
    expect(statusFilterCriteria("false")).toEqual({ todo: false, status: null })
    expect(statusFilterValue({ status: "Blocked" })).toBe("status:Blocked")
    expect(statusFilterValue({ todo: true })).toBe("true")
    expect(statusFilterValue({})).toBe("")
  })
})

describe("statusProblem", () => {
  const ok = [{ name: "A", done: false }, { name: "B", done: true }]

  it("accepts a valid list", () => expect(statusProblem(ok)).toBeNull())
  it("needs at least two and no more than eight", () => {
    expect(statusProblem([ok[0]])).toMatch(/between 2 and 8/)
    expect(statusProblem(Array.from({ length: 9 }, (_, i) => ({ name: `S${i}`, done: i === 0 })))).toMatch(/between 2 and 8/)
  })
  it("rejects blank and repeated names", () => {
    expect(statusProblem([{ name: " ", done: false }, ok[1]])).toMatch(/needs a name/)
    expect(statusProblem([{ name: "A", done: false }, { name: "a", done: true }])).toMatch(/different/)
  })
  it("needs both a finished and an unfinished status", () => {
    expect(statusProblem([{ name: "A", done: true }, { name: "B", done: true }])).toMatch(/at least one/)
    expect(statusProblem([{ name: "A", done: false }, { name: "B", done: false }])).toMatch(/at least one/)
  })
})

function Harness({ initial }) {
  const [statuses, setStatuses] = useState(initial)
  return <StatusEditor statuses={statuses} onChange={setStatuses} />
}

describe("StatusEditor", () => {
  const start = [{ name: "Still to do", done: false }, { name: "Done", done: true }]

  it("adds, renames and removes statuses", () => {
    render(<Harness initial={start} />)

    fireEvent.click(screen.getByRole("button", { name: "+ Add status" }))
    fireEvent.change(screen.getByLabelText("Status 3 name"), { target: { value: "In review" } })
    expect(screen.getByLabelText("Status 3 name")).toHaveValue("In review")

    fireEvent.click(screen.getByRole("button", { name: "Remove status In review" }))
    expect(screen.queryByLabelText("Status 3 name")).not.toBeInTheDocument()
  })

  it("won't go below two statuses", () => {
    render(<Harness initial={start} />)
    expect(screen.getByRole("button", { name: "Remove status Still to do" })).toBeDisabled()
  })

  it("reorders statuses", () => {
    render(<Harness initial={[...start, { name: "Extra", done: false }]} />)

    fireEvent.click(screen.getByRole("button", { name: "Move status 3 up" }))

    expect(screen.getByLabelText("Status 2 name")).toHaveValue("Extra")
  })

  it("explains what stops a list from being valid", () => {
    render(<Harness initial={start} />)
    fireEvent.click(screen.getAllByRole("checkbox")[0])

    expect(screen.getByRole("alert")).toHaveTextContent("at least one status that counts as done and one that does not")
  })
})

describe("StatusPicker", () => {
  it("offers the project's statuses, marks finished ones, and reports the choice", () => {
    const onChange = vi.fn()
    render(<StatusPicker project={custom} value="Backlog" onChange={onChange} />)

    expect(screen.getByRole("option", { name: "Done (finished)" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Done" } })

    expect(onChange).toHaveBeenCalledWith("Done", true)
  })
})
