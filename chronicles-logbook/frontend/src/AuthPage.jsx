import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { signIn, signUp } from "./api"
import "./AuthPage.css"

function messageFrom(error) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again."
}

function AuthPage({ mode }) {
  const isSignUp = mode === "signup"
  const navigate = useNavigate()
  const redirectTimer = useRef(null)
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(
    () => () => {
      if (redirectTimer.current) window.clearTimeout(redirectTimer.current)
    },
    []
  )

  const updateField = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setError("")
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    const email = form.email.trim().toLowerCase()
    if (isSignUp && !form.fullName.trim()) {
      setError("Please enter your full name.")
      return
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (isSignUp && form.password !== form.confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      const result = isSignUp
        ? await signUp({
            full_name: form.fullName.trim(),
            email,
            password: form.password,
          })
        : await signIn({ email, password: form.password })

      window.localStorage.setItem("chronicles_token", result.access_token)
      window.localStorage.setItem("chronicles_user", JSON.stringify(result.user))
      setSuccess(isSignUp ? "Account created. Opening your logbook…" : "Signed in. Opening your logbook…")
      redirectTimer.current = window.setTimeout(() => navigate("/", { replace: true }), 700)
    } catch (caught) {
      setError(messageFrom(caught))
    } finally {
      setLoading(false)
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
              ? "Create your account to start recording your project journey."
              : "Enter your details to continue to your projects."}
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isSignUp && (
              <label>
                Full name
                <input
                  autoComplete="name"
                  name="fullName"
                  onChange={updateField}
                  placeholder="Ethan Student"
                  required
                  value={form.fullName}
                />
              </label>
            )}

            <label>
              Email address
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                onChange={updateField}
                placeholder="you@example.com"
                required
                type="email"
                value={form.email}
              />
            </label>

            <label>
              Password
              <input
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength="8"
                name="password"
                onChange={updateField}
                placeholder="At least 8 characters"
                required
                type="password"
                value={form.password}
              />
            </label>

            {isSignUp && (
              <label>
                Confirm password
                <input
                  autoComplete="new-password"
                  minLength="8"
                  name="confirmPassword"
                  onChange={updateField}
                  placeholder="Repeat your password"
                  required
                  type="password"
                  value={form.confirmPassword}
                />
              </label>
            )}

            {error && (
              <p className="auth-message auth-error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="auth-message auth-success" role="status">
                {success}
              </p>
            )}

            <button className="auth-submit" disabled={loading} type="submit">
              {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            {isSignUp ? "Already have an account?" : "New to Chronicles?"}{" "}
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
