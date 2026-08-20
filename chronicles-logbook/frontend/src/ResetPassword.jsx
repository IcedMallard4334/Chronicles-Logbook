import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { resetPassword } from "./api"
import "./AuthPage.css"

function ResetPassword() {
	const navigate = useNavigate()

	const token = new URLSearchParams(window.location.search).get("token")

	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [message, setMessage] = useState("")
	const [error, setError] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)

	const handleSubmit = async (event) => {
		event.preventDefault()
		setMessage("")
		setError("")

		if (!token) {
			setError("This password reset link is invalid.")
			return
		}

		if (password !== confirmPassword) {
			setError("Passwords do not match.")
			return
		}

		setIsSubmitting(true)

		try {
			const response = await resetPassword(token, password)
			setMessage(response.message)

			setTimeout(() => {
				navigate("/")
			}, 1500)
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Unable to reset your password.",
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
					<h1 id="auth-heading">Set a new password.</h1>
					<p>
						Choose a new password for your Chronicles account and get back to
						your logbook.
					</p>
				</div>
			</section>

			<section className="auth-panel" aria-labelledby="form-heading">
				<div className="auth-card">
					<p className="auth-kicker">Account recovery</p>
					<h2 id="form-heading">Reset your password</h2>

					<p className="auth-subtitle">
						Enter your new password below.
					</p>

					<form className="auth-form" onSubmit={handleSubmit}>
						<label>
							New password
							<input
								type="password"
								name="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								placeholder="At least 8 characters"
								minLength={8}
								maxLength={128}
								required
							/>
						</label>

						<label>
							Confirm password
							<input
								type="password"
								name="confirm-password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
								placeholder="Enter your password again"
								minLength={8}
								maxLength={128}
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
							{isSubmitting ? "Resetting..." : "Reset password"}
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

export default ResetPassword