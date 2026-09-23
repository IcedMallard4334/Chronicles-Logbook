import resend

from app.config import EMAIL_FROM, RESEND_API_KEY


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
