import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchStreaks: vi.fn(),
  recordStreakActivity: vi.fn(),
  STREAKS_CHANGED: "chronicles-streaks-changed",
}))

import { fetchStreaks, recordStreakActivity } from "./api"
import Streaks from "./Streaks"

const summary = (over = {}) => ({ current: 0, longest: 0, active_today: false, last_day: null, ...over })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Streaks", () => {
  it("records today's login and shows both streaks", async () => {
    recordStreakActivity.mockResolvedValue({
      login: summary({ current: 4, longest: 9, active_today: true }),
      interaction: summary({ current: 2, longest: 2 }),
    })

    render(<Streaks />)

    const list = await screen.findByRole("list", { name: "Daily streaks" })
    expect(recordStreakActivity).toHaveBeenCalledWith("login")
    const items = list.querySelectorAll("li")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("4")
    expect(items[0]).toHaveTextContent("Login streak: 4 days. Longest: 9 days.")
    expect(items[0]).toHaveTextContent("Done for today.")
    expect(items[1]).toHaveTextContent("Activity streak: 2 days")
    expect(items[1]).toHaveTextContent("Do something today to keep it going.")
  })

  it("updates when an interaction is recorded elsewhere in the app", async () => {
    // The login is only recorded once per page load, so later mounts just read.
    fetchStreaks.mockResolvedValue({ login: summary({ current: 1, active_today: true }), interaction: summary() })
    render(<Streaks />)
    await screen.findByRole("list", { name: "Daily streaks" })

    act(() => {
      window.dispatchEvent(
        new CustomEvent("chronicles-streaks-changed", {
          detail: { login: summary({ current: 1, active_today: true }), interaction: summary({ current: 1, longest: 1, active_today: true }) },
        })
      )
    })

    await waitFor(() => expect(screen.getByText(/Activity streak: 1 day\./)).toBeInTheDocument())
  })

  it("stays out of the way when the streak service fails", async () => {
    fetchStreaks.mockRejectedValue(new Error("down"))
    const { container } = render(<Streaks />)
    await waitFor(() => expect(fetchStreaks).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
