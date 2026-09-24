import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import HelpPage from "./HelpPage"

// A fixed fixture, independent of whatever the real manual's copy says, so
// these tests exercise the renderer/search/navigation contract rather than
// asserting specific wording that could change. Built inside vi.hoisted
// since vi.mock's factory below is hoisted above regular imports/consts.
const { FIXTURE } = vi.hoisted(() => ({
  FIXTURE: [
    {
      id: "basics",
      title: "Basics",
      articles: [
        {
          id: "creating-a-project",
          title: "Creating a project",
          keywords: ["project", "new", "workspace"],
          blocks: [
            { type: "p", text: "Click New project on the home screen." },
            { type: "ul", items: ["Give it a name", "Pick a starting schema"] },
          ],
        },
        {
          id: "field-types",
          title: "Field types",
          keywords: ["computed", "formula", "number"],
          blocks: [
            {
              type: "dl",
              items: [
                { term: "Number", detail: "Stores a numeric value.", example: "Hours spent on a task." },
                { term: "Computed", detail: "Recalculates from a formula.", example: "Total = hours × rate." },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "sharing",
      title: "Sharing",
      articles: [
        {
          id: "invitations",
          title: "Inviting someone",
          keywords: ["invite", "share", "collaborate"],
          blocks: [{ type: "ol", items: ["Open Share", "Enter their email", "Send the invite"] }],
        },
      ],
    },
  ],
}))

vi.mock("./helpContent", () => ({ HELP_SECTIONS: FIXTURE, default: FIXTURE }))

function renderHelp(initialEntries = ["/help"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/help" element={<HelpPage />} />
        <Route path="/app" element={<p>Logbook home</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe("HelpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the first article by default", () => {
    renderHelp()

    expect(screen.getByRole("heading", { name: "Creating a project" })).toBeInTheDocument()
    expect(screen.getByText("Click New project on the home screen.")).toBeInTheDocument()
  })

  it("lists every section and article in the topic nav", () => {
    renderHelp()

    const nav = screen.getByRole("navigation", { name: "Help topics" })
    expect(nav).toHaveTextContent("Basics")
    expect(nav).toHaveTextContent("Field types")
    expect(nav).toHaveTextContent("Sharing")
    expect(nav).toHaveTextContent("Inviting someone")
  })

  it("switches the displayed article when a topic is clicked", () => {
    renderHelp()

    fireEvent.click(screen.getByRole("button", { name: "Inviting someone" }))

    expect(screen.getByRole("heading", { name: "Inviting someone" })).toBeInTheDocument()
    expect(screen.getByText("Open Share")).toBeInTheDocument()
    expect(screen.queryByText("Click New project on the home screen.")).not.toBeInTheDocument()
  })

  it("marks the active topic so it can be styled distinctly", () => {
    renderHelp()

    fireEvent.click(screen.getByRole("button", { name: "Inviting someone" }))

    expect(screen.getByRole("button", { name: "Inviting someone" })).toHaveAttribute("aria-current", "true")
    expect(screen.getByRole("button", { name: "Creating a project" })).not.toHaveAttribute("aria-current")
  })

  it("renders a glossary block's term, detail and example", () => {
    renderHelp()

    fireEvent.click(screen.getByRole("button", { name: "Field types" }))

    expect(screen.getByText("Computed")).toBeInTheDocument()
    expect(screen.getByText("Recalculates from a formula.")).toBeInTheDocument()
    expect(screen.getByText(/Total = hours × rate\./)).toBeInTheDocument()
  })

  it("filters the topic list as the user searches", () => {
    renderHelp()

    fireEvent.change(screen.getByLabelText("Search help topics"), { target: { value: "invite" } })

    const nav = screen.getByRole("navigation", { name: "Help topics" })
    expect(nav).toHaveTextContent("Inviting someone")
    expect(nav).not.toHaveTextContent("Creating a project")
    expect(nav).not.toHaveTextContent("Field types")
  })

  it("matches on keywords, not just the visible title", () => {
    renderHelp()

    // "formula" never appears in the article's title, only its keywords —
    // this is what makes the search actually useful for someone who
    // doesn't know the exact feature name.
    fireEvent.change(screen.getByLabelText("Search help topics"), { target: { value: "formula" } })

    expect(screen.getByRole("button", { name: "Field types" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Creating a project" })).not.toBeInTheDocument()
  })

  it("says plainly when nothing matches a search", () => {
    renderHelp()

    fireEvent.change(screen.getByLabelText("Search help topics"), { target: { value: "xyzzy-nonsense" } })

    expect(screen.getByText(/No topics match/)).toBeInTheDocument()
  })

  it("opens directly to a topic given in the URL", () => {
    renderHelp(["/help?topic=invitations"])

    expect(screen.getByRole("heading", { name: "Inviting someone" })).toBeInTheDocument()
  })

  it("the Back button returns to the workspace", () => {
    renderHelp()

    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }))

    expect(screen.getByText("Logbook home")).toBeInTheDocument()
  })
})
