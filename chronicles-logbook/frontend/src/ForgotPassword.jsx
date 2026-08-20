import { useState } from "react"
import { Link } from "react-router-dom"

import { requestPasswordReset } from "./api"
import "./AuthPage.css"

function ForgotPassword() {
	const [email, setEmail] = useState("")
	const [message, setMessage] = useState("")
	const [error, setError] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (event) => {
		event.preventDefault()
		setMessage("")
		setError("")
		setIsSubmitting(true)

		try {
			const response = await requestPasswordReset(email)
			setMessage(response.message)
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Unable to send password reset link.",
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<main className="auth-shell">
			<section className="auth-intro" aria-labelledby="auth-heading">
				<Link className="auth-brand" to="/">
					<div className="auth-logo-c">
						<div className="auth-logo-ring" />
						<span className="auth-logo-letter">C</span>
					</div>
					<span>Chronicles</span>
				</Link>

				<div className="auth-copy">
					<p className="auth-eyebrow">Your work, remembered</p>
					<h1 id="auth-heading">Get back into your logbook.</h1>
					<p>
						Enter your email address and we&apos;ll send you a link to reset
						your password.
					</p>
				</div>
			</section>

			<section className="auth-panel" aria-labelledby="form-heading">
				<div className="auth-card">
					<p className="auth-kicker">Account recovery</p>
					<h2 id="form-heading">Forgot your password?</h2>

					<p className="auth-subtitle">
						Enter the email address associated with your Chronicles account.
					</p>

					<form className="auth-form" onSubmit={handleSubmit}>
						<label>
							Email address
							<input
								type="email"
								name="email"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="you@example.com"
								maxLength={320}
								required
							/>
						</label>

						{message && (
							<p className="auth-message" role="status">
								{message}
							</p>
						)}

						{error && (
							<p className="auth-message auth-error" role="alert">
								{error}
							</p>
						)}

						<button
							className="auth-submit"
							type="submit"
							disabled={isSubmitting}
						>
							{isSubmitting ? "Sending..." : "Send reset link"}
						</button>
					</form>

					<p className="auth-switch">
						Remember your password?{" "}
						<Link to="/">Back to sign in</Link>
					</p>
				</div>
			</section>
		</main>
	)
}

export default ForgotPassword