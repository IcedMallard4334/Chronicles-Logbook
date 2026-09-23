import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchExportDocument: vi.fn(),
  importLogbook: vi.fn(),
}))

import DataTransfer from "./DataTransfer"
import { fetchExportDocument, importLogbook } from "./api"

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
    fireEvent.click(screen.getByRole("menuitem", { name: /Export/ }))

    await waitFor(() => expect(clickedLink).not.toBeNull())
    expect(clickedLink.download).toMatch(/^chronicles-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(createdBlob.type).toBe("application/json")
  })

  it("closes the menu once the download starts", async () => {
    fetchExportDocument.mockResolvedValue(exportDocument)
    const onClose = vi.fn()

    render(<DataTransfer onClose={onClose} />)
    fireEvent.click(screen.getByRole("menuitem", { name: /Export/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("reports a failure instead of downloading nothing", async () => {
    fetchExportDocument.mockRejectedValue(new Error("Cannot reach the Chronicles API."))

    render(<DataTransfer />)
    fireEvent.click(screen.getByRole("menuitem", { name: /Export/ }))

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
