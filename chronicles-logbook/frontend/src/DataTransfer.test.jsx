import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchExportDocument: vi.fn(),
  fetchProjects: vi.fn(),
  importLogbook: vi.fn(),
}))

import DataTransfer from "./DataTransfer"
import { fetchExportDocument, fetchProjects, importLogbook } from "./api"

const exportDocument = {
  format: "chronicles-export",
  version: 1,
  exported_at: "2026-09-11T20:00:00Z",
  projects: [{ id: "proj-1", name: "Field Notes", entries: [] }],
}

const summary = {
  projects_created: 2,
  projects_reused: 1,
  entries_created: 47,
  entries_skipped: 0,
  issues: [],
}

let clickedLink
let createdBlob

beforeEach(() => {
  vi.clearAllMocks()
  clickedLink = null
  createdBlob = null

  // Capture the download rather than letting jsdom attempt one.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    clickedLink = this
  })
  globalThis.URL.createObjectURL = vi.fn((blob) => {
    createdBlob = blob
    return "blob:fake"
  })
  globalThis.URL.revokeObjectURL = vi.fn()
})

function chooseFile(contents) {
  const input = screen.getByLabelText("Choose an exported Chronicles file")
  const file = new File([contents], "export.json", { type: "application/json" })
  // jsdom does not implement File.text().
  file.text = () => Promise.resolve(contents)
  fireEvent.change(input, { target: { files: [file] } })
}

describe("export", () => {
  it("downloads the logbook as a dated JSON file", async () => {
    fetchExportDocument.mockResolvedValue(exportDocument)

    render(<DataTransfer />)
    fireEvent.click(screen.getByRole("menuitem", { name: /^Export/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON/ }))

    await waitFor(() => expect(clickedLink).not.toBeNull())
    expect(clickedLink.download).toMatch(/^chronicles-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(createdBlob.type).toBe("application/json")
  })

  it("offers every format and names the file for the one chosen", async () => {
    fetchExportDocument.mockResolvedValue(exportDocument)
    render(<DataTransfer />)
    fireEvent.click(screen.getByRole("menuitem", { name: /^Export/ }))

    const group = screen.getByRole("group", { name: "Export format" })
    for (const label of ["JSON", "CSV", "PDF", "Markdown", "Web page", "Plain text"]) {
      expect(within(group).getByRole("menuitem", { name: new RegExp(label) })).toBeInTheDocument()
    }

    fireEvent.click(within(group).getByRole("menuitem", { name: /PDF/ }))
    await waitFor(() => expect(clickedLink).not.toBeNull())
    expect(clickedLink.download).toMatch(/\.pdf$/)
    expect(createdBlob.type).toBe("application/pdf")
  })

  it("closes the menu once the download starts", async () => {
    fetchExportDocument.mockResolvedValue(exportDocument)
    const onClose = vi.fn()

    render(<DataTransfer onClose={onClose} />)
    fireEvent.click(screen.getByRole("menuitem", { name: /^Export/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("reports a failure instead of downloading nothing", async () => {
    fetchExportDocument.mockRejectedValue(new Error("Cannot reach the Chronicles API."))

    render(<DataTransfer />)
    fireEvent.click(screen.getByRole("menuitem", { name: /^Export/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: /JSON/ }))

    expect(await screen.findByText("Cannot reach the Chronicles API.")).toBeInTheDocument()
    expect(clickedLink).toBeNull()
  })
})

describe("import", () => {
  it("sends the parsed file and shows what came back", async () => {
    importLogbook.mockResolvedValue(summary)

    render(<DataTransfer />)
    chooseFile(JSON.stringify(exportDocument))

    await waitFor(() => expect(importLogbook).toHaveBeenCalledWith(exportDocument))
    expect(await screen.findByText("Import complete")).toBeInTheDocument()
    expect(screen.getByText("47")).toBeInTheDocument()
  })

  it("closes on Escape, clearing the summary the same way the Close button does", async () => {
    importLogbook.mockResolvedValue(summary)

    render(<DataTransfer />)
    chooseFile(JSON.stringify(exportDocument))
    expect(await screen.findByText("Import complete")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() => expect(screen.queryByText("Import complete")).not.toBeInTheDocument())
    // If Escape only closed the parent dropdown without clearing summary/
    // error the way the Close button does, a later re-render would still
    // find "Import complete" in the DOM — it must actually be gone, not
    // just visually covered by something else.
  })

  it("announces the import so the workspace can reload", async () => {
    importLogbook.mockResolvedValue(summary)
    const listener = vi.fn()
    window.addEventListener("chronicles-imported", listener)

    render(<DataTransfer />)
    chooseFile(JSON.stringify(exportDocument))

    await waitFor(() => expect(listener).toHaveBeenCalled())
    window.removeEventListener("chronicles-imported", listener)
  })

  it("rejects a file that is not JSON without calling the server", async () => {
    render(<DataTransfer />)
    chooseFile("this is not json")

    expect(await screen.findByText("That file is not valid JSON.")).toBeInTheDocument()
    expect(importLogbook).not.toHaveBeenCalled()
  })

  it("shows the server's reason when the file is rejected", async () => {
    importLogbook.mockRejectedValue(
      new Error("This file was exported by a newer version of Chronicles.")
    )

    render(<DataTransfer />)
    chooseFile(JSON.stringify({ format: "chronicles-export", version: 99 }))

    expect(await screen.findByText("Import failed")).toBeInTheDocument()
  })

  it("lists entries that could not be restored", async () => {
    // The skipped entries are the point of the summary — they are work that
    // did not come back, and the user needs to know which.
    importLogbook.mockResolvedValue({
      ...summary,
      entries_skipped: 2,
      issues: [
        "Entry from 2026-03-02 in 'Field Notes': Unknown field: topic",
        "Entry from 2026-04-15 in 'Field Notes': Unknown field: topic",
      ],
    })

    render(<DataTransfer />)
    chooseFile(JSON.stringify(exportDocument))

    expect(await screen.findByText("Could not be restored")).toBeInTheDocument()
    expect(
      screen.getByText("Entry from 2026-03-02 in 'Field Notes': Unknown field: topic")
    ).toBeInTheDocument()
  })
})

describe("import from a CSV file", () => {
  const chooseCsv = (contents, name = "my-logbook.csv") => {
    const input = screen.getByLabelText("Choose an exported Chronicles file")
    const file = new File([contents], name, { type: "text/csv" })
    file.text = () => Promise.resolve(contents)
    fireEvent.change(input, { target: { files: [file] } })
  }

  it("accepts CSV as well as JSON", () => {
    render(<DataTransfer />)

    expect(screen.getByLabelText("Choose an exported Chronicles file").accept).toContain(".csv")
  })

  it("shows what a CSV will do, and imports only once that is confirmed", async () => {
    fetchProjects.mockResolvedValue([])
    importLogbook.mockResolvedValue(summary)
    render(<DataTransfer />)

    chooseCsv("Project,Title,Hours\nOperating Systems,Lab 4,3\nOperating Systems,Lab 5,2\nGym,Legs,")

    expect(await screen.findByRole("heading", { name: "Import this CSV?" })).toBeInTheDocument()
    expect(screen.getByText(/3 entries and 0 tasks will be added/)).toBeInTheDocument()
    expect(screen.getByText("Operating Systems", { selector: "strong" })).toBeInTheDocument()
    expect(importLogbook).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Import" }))

    await waitFor(() => expect(importLogbook).toHaveBeenCalledTimes(1))
    const sent = importLogbook.mock.calls[0][0]
    expect(sent.format).toBe("chronicles-export")
    expect(sent.projects.map((project) => project.name)).toEqual(["Operating Systems", "Gym"])
    expect(await screen.findByRole("heading", { name: "Import complete" })).toBeInTheDocument()
  })

  it("imports nothing when the plan is cancelled", async () => {
    fetchProjects.mockResolvedValue([])
    render(<DataTransfer />)

    chooseCsv("Title\nA")
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))

    expect(importLogbook).not.toHaveBeenCalled()
    expect(screen.queryByRole("heading", { name: "Import this CSV?" })).not.toBeInTheDocument()
  })

  it("explains a CSV with no rows instead of importing it", async () => {
    fetchProjects.mockResolvedValue([])
    render(<DataTransfer />)

    chooseCsv("Title\n")

    expect(await screen.findByRole("alert")).toHaveTextContent("no rows to import")
    expect(importLogbook).not.toHaveBeenCalled()
  })

  it("reads the file in against the projects already there", async () => {
    fetchProjects.mockResolvedValue([{ id: "p1", name: "Gym", shared: false, entry_schema: [], statuses: [] }])
    render(<DataTransfer />)

    chooseCsv("Project,Title\nGym,Legs")

    expect(await screen.findByText(/added to the project you already have/)).toBeInTheDocument()
  })
})
