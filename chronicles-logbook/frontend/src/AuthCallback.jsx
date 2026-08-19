import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { fetchCurrentUser } from "./api"
import "./AuthPage.css"

function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState("")

  useEffect(() => {
    const completeLogin = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const token = params.get("token")
      const providerError = params.get("error")
      window.history.replaceState({}, "", "/auth/callback")

      if (providerError || !token) {
        setError(providerError || "Google did not return a valid session.")
        return
      }

      try {
        window.localStorage.setItem("chronicles_token", token)
        const user = await fetchCurrentUser()
        window.localStorage.setItem("chronicles_user", JSON.stringify(user))
        navigate("/app", { replace: true })
      } catch (caught) {
        window.localStorage.removeItem("chronicles_token")
        setError(caught instanceof Error ? caught.message : "Unable to complete sign in.")
      }
    }

    completeLogin()
  }, [navigate])

  return (
    <main className="auth-callback-shell">
      <section className="auth-callback-card" aria-live="polite">
        <span className="auth-mark">C</span>
        {error ? (
          <>
            <h1>Sign-in unsuccessful</h1>
            <p className="auth-message auth-error" role="alert">{error}</p>
            <Link className="auth-submit" to="/">Try again</Link>
          </>
        ) : (
          <>
            <h1>Signing you in…</h1>
            <p>Securely completing your Google sign-in.</p>
          </>
        )}
      </section>
    </main>
  )
}

export default AuthCallback
