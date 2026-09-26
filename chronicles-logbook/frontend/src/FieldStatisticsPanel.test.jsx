import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchFieldStatistics } from "./api"
import FieldStatisticsPanel from "./FieldStatisticsPanel"

vi.mock("./api", () => ({ fetchFieldStatistics: vi.fn() }))

const response = {
  project_id: "project-1",
  schema_version: 2,
  fields: [
    { field_id: "hours", name: "Hours", type: "number", count: 3, total: 12, average: 4, groups: [] },
    { field_id: "status", name: "Status", type: "dropdown", count: 3, groups: [
      { value: "Open", count: 2 }, { value: "Done", count: 1 },
    ] },
  ],
}

describe("FieldStatisticsPanel", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows numeric totals returned by the server", async () => {
    fetchFieldStatistics.mockResolvedValue(response)
    render(<FieldStatisticsPanel projectId="project-1" />)

    expect(await screen.findByLabelText("Hours metrics")).toHaveTextContent("Recorded values3")
    expect(screen.getByLabelText("Hours metrics")).toHaveTextContent("Total12")
    expect(screen.getByLabelText("Hours metrics")).toHaveTextContent("Average4")
    expect(fetchFieldStatistics).toHaveBeenCalledWith("project-1")
  })

  it("switches to grouped categorical statistics", async () => {
    fetchFieldStatistics.mockResolvedValue(response)
    render(<FieldStatisticsPanel projectId="project-1" />)
    await screen.findByLabelText("Hours metrics")

    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "status" } })
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(screen.getByText("Done")).toBeInTheDocument()
    expect(screen.getByText("3 recorded values")).toBeInTheDocument()
  })

  it("handles no fields and an API error", async () => {
    fetchFieldStatistics.mockResolvedValueOnce({ ...response, fields: [] })
    const { rerender } = render(<FieldStatisticsPanel projectId="empty" />)
    expect(await screen.findByText("No fields to analyse")).toBeInTheDocument()

    fetchFieldStatistics.mockRejectedValueOnce(new Error("Statistics unavailable"))
    rerender(<FieldStatisticsPanel projectId="broken" />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Statistics unavailable")
    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(fetchFieldStatistics).toHaveBeenCalledTimes(3))
  })

  it("reloads when the project's schema version changes", async () => {
    fetchFieldStatistics.mockResolvedValue(response)
    const { rerender } = render(<FieldStatisticsPanel projectId="project-1" schemaVersion={1} />)
    await screen.findByLabelText("Hours metrics")

    rerender(<FieldStatisticsPanel projectId="project-1" schemaVersion={2} />)
    await waitFor(() => expect(fetchFieldStatistics).toHaveBeenCalledTimes(2))
  })
})
