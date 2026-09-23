/* global document */

import { beforeEach, describe, expect, it, vi } from "vitest"

const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({ render: renderMock }))

vi.mock("react-dom/client", () => ({ createRoot: createRootMock }))

describe("main", () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockClear()
    createRootMock.mockClear()
  })

  // This imports the whole application — every route, page and chart library —
  // through a cold transform, since resetModules() above discards the cache.
  // That takes ~2.5s warm and well over the 5s default on a CI runner, where
  // every run is cold because it follows `npm ci`. The budget below reflects
  // what the test actually does; it is not a slow test, it is a large one.
  it("renders the current routed application into the root element", async () => {
    const rootElement = document.createElement("div")
    vi.spyOn(document, "getElementById").mockReturnValue(rootElement)

    await import("./main.jsx")

    expect(document.getElementById).toHaveBeenCalledWith("root")
    expect(createRootMock).toHaveBeenCalledWith(rootElement)
    expect(renderMock).toHaveBeenCalledTimes(1)
  }, 30_000)
})
