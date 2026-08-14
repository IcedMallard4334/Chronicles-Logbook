import { Link } from "react-router-dom"

import { getGoogleLoginUrl } from "./api"
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
              ? "Use your Google account to create a secure Chronicles profile."
              : "Continue securely with the Google account linked to Chronicles."}
          </p>

          <a className="google-auth-button" href={getGoogleLoginUrl()}>
            <GoogleIcon />
            <span>Continue with Google</span>
          </a>

          <p className="auth-provider-note">
            Google manages your password and password recovery. Chronicles never receives or stores
            your Google password.
          </p>

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
