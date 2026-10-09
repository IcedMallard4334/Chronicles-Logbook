/**
 * Being invited to somebody else's project, and being able to say no.
 *
 * Sharing used to be a grant: an owner typed your email and their project
 * appeared in your sidebar, unasked, with no way to hand it back. What is
 * tested here is that the offer arrives as something to answer, and that
 * answering it either way removes it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./api", () => ({
  fetchInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  fetchInvitationAnswers: vi.fn(),
  dismissInvitationAnswers: vi.fn(),
}))

import Invitations from "./Invitations"
import {
  acceptInvitation,
  declineInvitation,
  dismissInvitationAnswers,
  fetchInvitationAnswers,
  fetchInvitations,
} from "./api"

const invitation = {
  project_id: "p9",
  project_name: "Reading Group",
  project_description: "Papers we are working through together",
  invited_by_name: "Sipho Ndlovu",
  entry_count: 12,
  invited_at: "2026-09-14T09:00:00Z",
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchInvitations.mockResolvedValue([invitation])
  acceptInvitation.mockResolvedValue(null)
  declineInvitation.mockResolvedValue(null)
  fetchInvitationAnswers.mockResolvedValue([])
  dismissInvitationAnswers.mockResolvedValue(null)
})

describe("the invitations bell", () => {
  it("is not there at all when nothing is waiting", async () => {
    // A permanently empty notification icon teaches people to stop looking.
    fetchInvitations.mockResolvedValue([])
    const { container } = render(<Invitations />)

    await waitFor(() => expect(fetchInvitations).toHaveBeenCalled())
    expect(container.querySelector(".invites")).toBeNull()
  })

  it("appears with a count once something is", async () => {
    render(<Invitations />)

    const bell = await screen.findByRole("button", { name: /1 project invitation/ })
    expect(bell).toHaveTextContent("1")
  })

  it("names the project, the person and how much is in it", async () => {
    render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))

    expect(screen.getByText("Reading Group")).toBeInTheDocument()
    expect(screen.getByText(/Sipho Ndlovu invited you/)).toBeInTheDocument()
    expect(screen.getByText(/12 entries so far/)).toBeInTheDocument()
  })

  it("says plainly that nothing has been shared yet", async () => {
    render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))

    expect(
      screen.getByText("Nothing is added to your workspace until you accept.")
    ).toBeInTheDocument()
  })
})

describe("answering an invitation", () => {
  it("joins the project and tells the workspace to reload", async () => {
    const onChanged = vi.fn()
    render(<Invitations onChanged={onChanged} />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))

    fireEvent.click(screen.getByRole("button", { name: "Join" }))

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("p9"))
    expect(onChanged).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText("Reading Group")).toBeNull())
  })

  it("declines without the project ever touching the workspace", async () => {
    render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))

    fireEvent.click(screen.getByRole("button", { name: "Decline" }))

    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith("p9"))
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it("closes on Escape without answering the invitation", async () => {
    render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))
    expect(screen.getByText("Reading Group")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })

    expect(screen.queryByText("Reading Group")).not.toBeInTheDocument()
    expect(acceptInvitation).not.toHaveBeenCalled()
    expect(declineInvitation).not.toHaveBeenCalled()
  })

  it("reports a refusal rather than quietly dropping the invitation", async () => {
    acceptInvitation.mockRejectedValue(
      new Error("This invitation is no longer waiting for an answer.")
    )
    render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /invitation/ }))

    fireEvent.click(screen.getByRole("button", { name: "Join" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("no longer waiting")
  })
})

describe("telling the owner an invitation was answered", () => {
  const answered = [
    { project_id: "p1", project_name: "Fieldwork", person_name: "Sam Dube", answer: "accepted", answered_at: "2026-10-09T09:00:00Z" },
    { project_id: "p2", project_name: "Lab Log", person_name: "Lee Moyo", answer: "declined", answered_at: "2026-10-09T10:00:00Z" },
  ]

  it("shows the bell for an answer even when nothing is waiting for the owner's own reply", async () => {
    fetchInvitations.mockResolvedValue([])
    fetchInvitationAnswers.mockResolvedValue(answered)
    render(<Invitations />)

    const bell = await screen.findByRole("button", { name: /2 project notices/ })
    fireEvent.click(bell)

    expect(screen.getByText("Sam Dube")).toBeInTheDocument()
    expect(screen.getByText("joined Fieldwork")).toBeInTheDocument()
    expect(screen.getByText("declined Lab Log")).toBeInTheDocument()
    expect(screen.queryByText("Nothing is added to your workspace until you accept.")).toBeNull()
  })

  it("lists answers above the invitations to answer, and counts both", async () => {
    fetchInvitationAnswers.mockResolvedValue([answered[0]])
    render(<Invitations />)

    fireEvent.click(await screen.findByRole("button", { name: /2 project notices/ }))

    expect(screen.getByText("joined Fieldwork")).toBeInTheDocument()
    expect(screen.getByText("Reading Group")).toBeInTheDocument()
  })

  it("dismisses the notices, closing the panel when nothing else is left", async () => {
    fetchInvitations.mockResolvedValue([])
    fetchInvitationAnswers.mockResolvedValue(answered)
    const { container } = render(<Invitations />)
    fireEvent.click(await screen.findByRole("button", { name: /2 project notices/ }))

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))

    await waitFor(() => expect(dismissInvitationAnswers).toHaveBeenCalled())
    expect(container.querySelector(".invites")).toBeNull()
  })

  it("keeps working when the answers cannot be fetched", async () => {
    fetchInvitationAnswers.mockRejectedValue(new Error("down"))
    render(<Invitations />)

    expect(await screen.findByRole("button", { name: /1 project invitation/ })).toBeInTheDocument()
  })
})
