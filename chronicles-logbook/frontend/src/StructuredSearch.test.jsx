import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { StructuredSearch } from "./StructuredSearch"

const schema = [
  { id: "f-title", name: "Title", type: "text" },
  { id: "f-hours", name: "Hours", type: "number" },
  {
    id: "f-status",
    name: "Status",
    type: "dropdown",
    options: ["Open", "Closed"],
  },
  { id: "f-checklist", name: "Checklist", type: "checklist" },
]

describe("StructuredSearch", () => {
  it("explains itself instead of rendering a form when no project is selected", () => {
    render(<StructuredSearch schema={null} conditions={[]} match="all" onChange={vi.fn()} />)

    expect(screen.getByText(/Pick a project above/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "+ Add filter" })).not.toBeInTheDocument()
  })

  it("adds a condition on the first queryable field when 'Add filter' is clicked", () => {
    const onChange = vi.fn()
    render(<StructuredSearch schema={schema} conditions={[]} match="all" onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "+ Add filter" }))

    expect(onChange).toHaveBeenCalledWith(
      [{ field_id: "f-title", operator: "contains", value: "" }],
      "all",
    )
  })

  it("offers only the operators that apply to the selected field's type", () => {
    const onChange = vi.fn()
    render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-hours", operator: "gte", value: 3 }]}
        match="all"
        onChange={onChange}
      />,
    )

    const operatorSelect = screen.getByLabelText("Comparison")
    const options = [...operatorSelect.options].map((option) => option.value)
    expect(options).toEqual(["equals", "gt", "gte", "lt", "lte", "between"])
  })

  it("switching a condition to another field resets the operator to one valid for it", () => {
    const onChange = vi.fn()
    render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-hours", operator: "gte", value: 3 }]}
        match="all"
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "f-status" } })

    expect(onChange).toHaveBeenCalledWith(
      [{ field_id: "f-status", operator: "equals", value: "Open", value2: undefined }],
      "all",
    )
  })

  it("shows two inputs for the 'between' operator", () => {
    render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-hours", operator: "between", value: 1, value2: 5 }]}
        match="all"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText("From")).toBeInTheDocument()
    expect(screen.getByLabelText("To")).toBeInTheDocument()
  })

  it("offers a yes/no choice for the checklist 'complete' operator", () => {
    render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-checklist", operator: "complete", value: true }]}
        match="all"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue("yes")).toBeInTheDocument()
  })

  it("removes a condition row", () => {
    const onChange = vi.fn()
    render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-hours", operator: "gte", value: 3 }]}
        match="all"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Remove this filter on Hours/ }))

    expect(onChange).toHaveBeenCalledWith([], "all")
  })

  it("only offers an AND/OR choice once there are two or more conditions", () => {
    const { rerender } = render(
      <StructuredSearch
        schema={schema}
        conditions={[{ field_id: "f-hours", operator: "gte", value: 3 }]}
        match="all"
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText("Match")).not.toBeInTheDocument()

    const onChange = vi.fn()
    rerender(
      <StructuredSearch
        schema={schema}
        conditions={[
          { field_id: "f-hours", operator: "gte", value: 3 },
          { field_id: "f-status", operator: "equals", value: "Open" },
        ]}
        match="all"
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText("Match"), { target: { value: "any" } })
    expect(onChange).toHaveBeenCalledWith(
      [
        { field_id: "f-hours", operator: "gte", value: 3 },
        { field_id: "f-status", operator: "equals", value: "Open" },
      ],
      "any",
    )
  })
})
