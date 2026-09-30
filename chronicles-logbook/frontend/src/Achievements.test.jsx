import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchAchievements: vi.fn(),
  markAchievementsSeen: vi.fn(() => Promise.resolve()),
  ACTIVITY_EVENT: "chronicles-activity",
  STREAKS_CHANGED: "chronicles-streaks-changed",
}))

import AchievementCelebration from "./AchievementCelebration"
import AchievementsSection from "./AchievementsSection"
import BadgeArt, { TIER_LABELS } from "./BadgeArt"
import Confetti, { makePieces, prefersReducedMotion } from "./Confetti"
import { fetchAchievements, markAchievementsSeen } from "./api"

const badge = (over = {}) => ({
  key: "first_project", name: "First Chapter", category: "projects", category_name: "Projects", tier: "bronze",
  blurb: "Every logbook starts with a single page.", how: "Create your first project.", target: 1, progress: 1,
  earned: true, earned_at: "2026-09-29T10:00:00Z", is_new: false, ...over,
})

const summary = (badges) => ({
  badges,
  earned: badges.filter((item) => item.earned).length,
  total: badges.length,
  by_tier: {
    bronze: { earned: 1, total: 2 }, silver: { earned: 0, total: 1 }, gold: { earned: 0, total: 0 }, legendary: { earned: 0, total: 0 },
  },
  by_category: {
    projects: { name: "Projects", earned: 1, total: 2 }, login: { name: "Showing up", earned: 0, total: 1 },
  },
})

const BADGES = [
  badge(),
  badge({ key: "five_projects", name: "Bookshelf", tier: "silver", target: 5, progress: 2, earned: false, earned_at: null }),
  badge({ key: "login_10", name: "Creature of Habit", category: "login", category_name: "Showing up", tier: "bronze", target: 10, progress: 4, earned: false, earned_at: null, how: "Open Chronicles 10 days in a row.", blurb: "Ten days in a row." }),
]

let rafQueue
beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  rafQueue = []
  window.matchMedia = vi.fn(() => ({ matches: false }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("BadgeArt", () => {
  it("is decorative, coloured by tier, and stars mark the tier", () => {
    const { container } = render(<BadgeArt badge={badge({ tier: "legendary" })} />)
    const svg = container.querySelector("svg")
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg).toHaveClass("badge-art-legendary", "is-earned")
    expect(container.querySelectorAll("g[fill] circle")).toHaveLength(4)
    expect(TIER_LABELS.legendary).toBe("Legendary")
  })

  it("shows a progress ring on a badge not yet earned", () => {
    const { container } = render(<BadgeArt badge={badge({ earned: false, progress: 5, target: 10 })} />)
    expect(container.querySelector("svg")).toHaveClass("is-locked")
    const ring = container.querySelector(".badge-art-progress")
    const [filled, whole] = ring.getAttribute("stroke-dasharray").split(" ").map(Number)
    expect(filled / whole).toBeCloseTo(0.5, 2)
  })

  it("draws no ring once earned, and copes with an unknown category", () => {
    const { container } = render(<BadgeArt badge={badge({ category: "mystery" })} />)
    expect(container.querySelector(".badge-art-progress")).toBeNull()
    expect(container.querySelector("svg")).toBeInTheDocument()
  })
})

describe("Confetti", () => {
  it("builds pieces from the corners and the top, all moving", () => {
    const pieces = makePieces(1000, 800, () => 0.5)
    expect(pieces).toHaveLength(170)
    expect(pieces.some((piece) => piece.x === 0 && piece.vx > 0 && piece.vy < 0)).toBe(true)
    expect(pieces.some((piece) => piece.x === 1000 && piece.vx < 0 && piece.vy < 0)).toBe(true)
    expect(pieces.some((piece) => piece.x === 500 && piece.y === 120)).toBe(true)
  })

  it("does nothing for someone who prefers reduced motion, and says it is finished", () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    const onDone = vi.fn()
    expect(prefersReducedMotion()).toBe(true)

    const { container } = render(<Confetti onDone={onDone} />)

    expect(onDone).toHaveBeenCalled()
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true")
  })

  it("finishes straight away where there is no canvas to draw on", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
    const onDone = vi.fn()
    render(<Confetti onDone={onDone} />)
    expect(onDone).toHaveBeenCalled()
  })

  it("draws frames, then stops and reports when the burst is over", () => {
    const context = {
      clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      fillRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    }
    HTMLCanvasElement.prototype.getContext = vi.fn(() => context)
    let clock = 0
    vi.spyOn(performance, "now").mockImplementation(() => clock)
    vi.stubGlobal("requestAnimationFrame", (callback) => { rafQueue.push(callback); return rafQueue.length })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const onDone = vi.fn()

    const { unmount } = render(<Confetti onDone={onDone} />)
    const step = (time) => { clock = time; const callback = rafQueue.shift(); callback(time) }

    step(16)
    expect(context.clearRect).toHaveBeenCalled()
    expect(context.fillRect.mock.calls.length + context.arc.mock.calls.length).toBeGreaterThan(100)
    expect(onDone).not.toHaveBeenCalled()

    step(3500)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(rafQueue).toHaveLength(0)
    unmount()
  })
})

describe("AchievementsSection", () => {
  it("summarises progress and lists every badge, earned or not", async () => {
    fetchAchievements.mockResolvedValue(summary(BADGES))
    render(<AchievementsSection />)

    expect(await screen.findByRole("img", { name: "1 of 3 badges earned" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Bronze: 1 of 2" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Projects: 1 of 2" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "First Chapter, Bronze, earned" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Bookshelf, Silver, 2 of 5" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Creature of Habit, Bronze, 4 of 10" })).toBeInTheDocument()
  })

  it("opens a badge to explain it and how to earn it, with its progress", async () => {
    fetchAchievements.mockResolvedValue(summary(BADGES))
    render(<AchievementsSection />)

    fireEvent.click(await screen.findByRole("button", { name: "Creature of Habit, Bronze, 4 of 10" }))

    const dialog = screen.getByRole("dialog", { name: "Creature of Habit" })
    expect(within(dialog).getByText("Ten days in a row.")).toBeInTheDocument()
    expect(within(dialog).getByText("Open Chronicles 10 days in a row.")).toBeInTheDocument()
    expect(within(dialog).getByText("4 of 10")).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("says when an earned badge was earned", async () => {
    fetchAchievements.mockResolvedValue(summary(BADGES))
    render(<AchievementsSection />)

    fireEvent.click(await screen.findByRole("button", { name: "First Chapter, Bronze, earned" }))

    const dialog = screen.getByRole("dialog", { name: "First Chapter" })
    expect(within(dialog).getByText("Earned")).toBeInTheDocument()
    expect(within(dialog).getByText(/2026/)).toBeInTheDocument()
  })

  it("filters to earned badges or those still to earn", async () => {
    fetchAchievements.mockResolvedValue(summary(BADGES))
    render(<AchievementsSection />)
    await screen.findByRole("button", { name: "First Chapter, Bronze, earned" })

    fireEvent.click(screen.getByRole("button", { name: "Earned" }))
    expect(screen.getByRole("button", { name: "First Chapter, Bronze, earned" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Bookshelf/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "To earn" }))
    expect(screen.queryByRole("button", { name: /First Chapter/ })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Bookshelf/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "To earn" })).toHaveAttribute("aria-pressed", "true")
  })

  it("encourages when a filter has nothing in it", async () => {
    fetchAchievements.mockResolvedValue(summary([badge({ earned: false, earned_at: null, progress: 0 })]))
    render(<AchievementsSection />)
    await screen.findByRole("button", { name: /First Chapter/ })

    fireEvent.click(screen.getByRole("button", { name: "Earned" }))

    expect(screen.getByText("Nothing here yet. Keep going!")).toBeInTheDocument()
  })

  it("reports when the badges can't be loaded", async () => {
    fetchAchievements.mockRejectedValue(new Error("down"))
    render(<AchievementsSection />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your badges.")
  })

  it("scrolls into view when sent here from a celebration", async () => {
    window.location.hash = "#achievements"
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    fetchAchievements.mockResolvedValue(summary(BADGES))

    render(<AchievementsSection />)

    await waitFor(() => expect(scroll).toHaveBeenCalled())
    window.location.hash = ""
  })
})

describe("AchievementCelebration", () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null)
  })

  function Probe() {
    const location = useLocation()
    return <p data-testid="where">{location.pathname}{location.hash}</p>
  }

  const renderHost = () =>
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <AchievementCelebration />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    )

  it("celebrates a newly earned badge, then records that it was shown", async () => {
    fetchAchievements.mockResolvedValue(summary([badge({ is_new: true })]))
    const { container } = renderHost()

    const dialog = await screen.findByRole("dialog", { name: "First Chapter" }, { timeout: 3000 })
    expect(within(dialog).getByText("Achievement unlocked")).toBeInTheDocument()
    expect(within(dialog).getByText("Every logbook starts with a single page.")).toBeInTheDocument()
    expect(within(dialog).getByText("Bronze · Projects")).toBeInTheDocument()
    expect(container.ownerDocument.querySelector(".confetti-canvas")).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole("button", { name: "Nice!" }))

    expect(markAchievementsSeen).toHaveBeenCalledWith(["first_project"])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows several new badges one after another", async () => {
    fetchAchievements.mockResolvedValue(summary([
      badge({ is_new: true }),
      badge({ key: "first_entry", name: "Ink Spilled", category: "entries", category_name: "Entries", is_new: true }),
    ]))
    renderHost()

    await screen.findByRole("dialog", { name: "First Chapter" }, { timeout: 3000 })
    expect(screen.getByText("1 more to see after this one.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))

    expect(await screen.findByRole("dialog", { name: "Ink Spilled" })).toBeInTheDocument()
    expect(markAchievementsSeen).toHaveBeenCalledWith(["first_project"])
  })

  it("can take the person straight to their badges", async () => {
    fetchAchievements.mockResolvedValue(summary([badge({ is_new: true })]))
    renderHost()

    fireEvent.click(await screen.findByRole("button", { name: "See all my badges" }, { timeout: 3000 }))

    expect(markAchievementsSeen).toHaveBeenCalledWith(["first_project"])
    expect(screen.getByTestId("where")).toHaveTextContent("/profile#achievements")
  })

  it("stays quiet when nothing is new, and when the check fails", async () => {
    fetchAchievements.mockResolvedValueOnce(summary([badge()])).mockRejectedValue(new Error("down"))
    renderHost()

    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    act(() => { window.dispatchEvent(new Event("chronicles-activity")) })
    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(2), { timeout: 3000 })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("checks again after something is saved or a streak changes, settling bursts into one check", async () => {
    fetchAchievements.mockResolvedValue(summary([badge()]))
    renderHost()
    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(1), { timeout: 3000 })

    act(() => {
      window.dispatchEvent(new Event("chronicles-activity"))
      window.dispatchEvent(new Event("chronicles-activity"))
      window.dispatchEvent(new Event("chronicles-streaks-changed"))
    })

    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(2), { timeout: 3000 })
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(fetchAchievements).toHaveBeenCalledTimes(2)
  })

  it("does not show a badge twice if two checks both report it as new", async () => {
    fetchAchievements.mockResolvedValue(summary([badge({ is_new: true })]))
    renderHost()
    await screen.findByRole("dialog", { name: "First Chapter" }, { timeout: 3000 })

    act(() => { window.dispatchEvent(new Event("chronicles-activity")) })
    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(2), { timeout: 3000 })

    expect(screen.queryByText(/more to see/)).not.toBeInTheDocument()
  })
})
