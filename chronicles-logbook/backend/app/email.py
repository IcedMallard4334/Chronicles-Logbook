import resend

from app.config import EMAIL_FROM, RESEND_API_KEY


def send_password_reset_email(
    recipient: str,
    reset_url: str,
) -> None:
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured.")

    if not EMAIL_FROM:
        raise RuntimeError("EMAIL_FROM is not configured.")

    resend.api_key = RESEND_API_KEY

    resend.Emails.send(
        {
            "from": EMAIL_FROM,
            "to": [recipient],
            "subject": "Reset your Chronicles password",
            "html": f"""
                <h2>Reset your password</h2>

                <p>
                    Someone requested a password reset for your
                    Chronicles account.
                </p>

                <p>
                    <a href="{reset_url}">
                        Reset your password
                    </a>
                </p>

                <p>
                    This link expires in 30 minutes and can only be used once.
                </p>

                <p>
                    If you did not request this reset, you can safely
                    ignore this email.
                </p>
            """,
        }
    )


def send_account_deleted_email(recipient: str) -> None:
    if not RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured.")

    if not EMAIL_FROM:
        raise RuntimeError("EMAIL_FROM is not configured.")

    resend.api_key = RESEND_API_KEY

    resend.Emails.send(
        {
            "from": EMAIL_FROM,
            "to": [recipient],
            "subject": "Your Chronicles account has been deleted",
            "html": """
                <h2>Account deleted</h2>

                <p>
                    Your Chronicles account has been successfully deleted.
                </p>

                <p>
                    If you decide to return, you can create a new account
                    using this email address again.
                </p>
            """,
        }
    )