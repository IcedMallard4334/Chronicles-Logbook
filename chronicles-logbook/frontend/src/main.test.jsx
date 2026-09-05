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

  it("renders the current routed application into the root element", async () => {
    const rootElement = document.createElement("div")
    vi.spyOn(document, "getElementById").mockReturnValue(rootElement)

    await import("./main.jsx")

    expect(document.getElementById).toHaveBeenCalledWith("root")
    expect(createRootMock).toHaveBeenCalledWith(rootElement)
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})
