import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import LandingPage from "./LandingPage"

const page = () => render(<MemoryRouter><LandingPage /></MemoryRouter>)

describe("the landing page", () => {
  it("says what Chronicles is and offers a way in at the top and the bottom", () => {
    page()

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Keep a record of everything you work on")
    expect(screen.getAllByRole("link", { name: /Start your logbook, free/ })).toHaveLength(2)
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", expect.stringContaining("/auth/google"))
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/signin")
  })

  it("lays out the features, the showcases, the steps and the questions", () => {
    page()

    expect(screen.getByRole("heading", { name: "A logbook that does more than hold notes." })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(20)
    for (const title of ["A logbook in your shape", "Automations that follow the way you work.", "An assistant that does the clicking for you.", "Up and running in three steps."]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(screen.getByText("Is Chronicles free?")).toBeInTheDocument()
  })

  it("switches the example between who it is for", () => {
    page()
    const group = screen.getByRole("group", { name: "Who it is for" })

    expect(screen.getByText("A study log that shows where the term went.")).toBeInTheDocument()
    fireEvent.click(within(group).getByRole("button", { name: "Developers" }))

    expect(screen.getByText("A build journal for every project.")).toBeInTheDocument()
    expect(within(group).getByRole("button", { name: "Developers" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("A study log that shows where the term went.")).toBeNull()
  })

  it("can jump to its sections from the navigation", () => {
    page()
    const nav = screen.getByRole("navigation", { name: "Sections" })

    expect(within(nav).getByRole("link", { name: "Features" })).toHaveAttribute("href", "#features")
    expect(document.getElementById("features")).not.toBeNull()
    expect(document.getElementById("faq")).not.toBeNull()
    expect(document.getElementById("mira")).not.toBeNull()
  })
})
