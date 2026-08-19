import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { getGoogleLoginUrl, registerWithPassword, signInWithPassword } from "./api"
import "./AuthPage.css"

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.86A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  )
}

function AuthPage({ mode }) {
  const isSignUp = mode === "signup"
  const navigate = useNavigate()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handlePasswordAuth = async (event) => {
    event.preventDefault()
    setError("")

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setIsSubmitting(true)
    try {
      const session = isSignUp
        ? await registerWithPassword({ full_name: fullName, email, password })
        : await signInWithPassword({ email, password })
      window.localStorage.setItem("chronicles_token", session.access_token)
      window.localStorage.setItem("chronicles_user", JSON.stringify(session.user))
      navigate("/app", { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-heading">
        <Link className="auth-brand" to="/">
          <span className="auth-mark">C</span>
          <span>Chronicles</span>
        </Link>
        <div className="auth-copy">
          <p className="auth-eyebrow">Your work, remembered</p>
          <h1 id="auth-heading">A logbook shaped around the way you work.</h1>
          <p>
            Capture progress quickly, keep every project organised, and turn your entries into a
            useful record.
          </p>
        </div>
      </section>

      <section className="auth-panel" aria-labelledby="form-heading">
        <div className="auth-card">
          <p className="auth-kicker">{isSignUp ? "Start your logbook" : "Welcome back"}</p>
          <h2 id="form-heading">{isSignUp ? "Create an account" : "Sign in"}</h2>
          <p className="auth-subtitle">
            {isSignUp
              ? "Create an account with Google or your email address."
              : "Continue with Google or sign in with your email and password."}
          </p>

          <a className="google-auth-button" href={getGoogleLoginUrl()}>
            <GoogleIcon />
            <span>Continue with Google</span>
          </a>

          <p className="auth-provider-note">
            Google will ask you to choose an account each time.
          </p>

          <div className="auth-divider"><span>or use email</span></div>

          <form className="auth-form" onSubmit={handlePasswordAuth}>
            {isSignUp && (
              <label>
                Full name
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your full name"
                  minLength="2"
                  maxLength="100"
                  required
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                maxLength="320"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                minLength={isSignUp ? "8" : "1"}
                maxLength="128"
                required
              />
            </label>

            {isSignUp && (
              <label>
                Confirm password
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Enter your password again"
                  minLength="8"
                  maxLength="128"
                  required
                />
              </label>
            )}

            {error && <p className="auth-message auth-error" role="alert">{error}</p>}

            <button className="auth-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait…"
                : isSignUp
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            {isSignUp ? "Already registered?" : "New to Chronicles?"}{" "}
            <Link to={isSignUp ? "/signin" : "/signup"}>
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

export default AuthPage
