import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { fetchCurrentUser } from "./api"
import "./AuthPage.css"

function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const completeLogin = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const token = params.get("token")
      const providerError = params.get("error")
      window.history.replaceState({}, "", "/auth/callback")

      if (providerError || !token) {
        setStatus("error")
        setMessage(providerError || "Google did not return a valid session.")
        return
      }

      try {
        window.localStorage.setItem("chronicles_token", token)
        const user = await fetchCurrentUser()
        window.localStorage.setItem("chronicles_user", JSON.stringify(user))
        setStatus("success")
        setMessage(`Welcome, ${user.full_name}!`)

        // Stay on the success screen briefly so the user sees confirmation.
        setTimeout(() => {
          navigate("/app", { replace: true })
        }, 1500)
      } catch (caught) {
        window.localStorage.removeItem("chronicles_token")
        setStatus("error")
        setMessage(caught instanceof Error ? caught.message : "Unable to complete sign in.")
      }
    }

    completeLogin()
  }, [navigate])

  return (
    <main className="auth-callback-shell">
      <section className="auth-callback-card" aria-live="polite">
        <span className="auth-mark">C</span>

        {status === "loading" && (
          <>
            <h1>Signing you in…</h1>
            <p>Securely completing your Google sign-in.</p>
            <div className="auth-callback-spinner" aria-hidden="true" />
          </>
        )}

        {status === "success" && (
          <>
            <h1>Sign-in successful</h1>
            <p className="auth-message auth-success" role="status">{message}</p>
            <p className="auth-callback-hint">Taking you to your logbook…</p>
          </>
        )}

        {status === "error" && (
          <>
            <h1>Sign-in unsuccessful</h1>
            <p className="auth-message auth-error" role="alert">{message}</p>
            <Link className="auth-submit" to="/">Try again</Link>
          </>
        )}
      </section>
    </main>
  )
}

export default AuthCallback
