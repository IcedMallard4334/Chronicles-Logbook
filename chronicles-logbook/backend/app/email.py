import smtplib
from email.message import EmailMessage

from app.config import (
    BREVO_SMTP_HOST,
    BREVO_SMTP_PASSWORD,
    BREVO_SMTP_PORT,
    BREVO_SMTP_USERNAME,
    MAIL_FROM,
    MAIL_FROM_NAME,
)


def _send_email(
    recipient: str,
    subject: str,
    html: str,
) -> None:
    if not BREVO_SMTP_USERNAME:
        raise RuntimeError("BREVO_SMTP_USERNAME is not configured.")

    if not BREVO_SMTP_PASSWORD:
        raise RuntimeError("BREVO_SMTP_PASSWORD is not configured.")

    if not MAIL_FROM:
        raise RuntimeError("MAIL_FROM is not configured.")

    message = EmailMessage()
    message["From"] = f"{MAIL_FROM_NAME} <{MAIL_FROM}>"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(html, subtype="html")

    with smtplib.SMTP(BREVO_SMTP_HOST, BREVO_SMTP_PORT) as server:
        server.starttls()
        server.login(BREVO_SMTP_USERNAME, BREVO_SMTP_PASSWORD)
        server.send_message(message)


def send_account_deleted_email(recipient: str) -> None:
    _send_email(
        recipient=recipient,
        subject="Your Chronicles account has been deleted",
        html="""
            <h2>Account deleted</h2>

            <p>
                Your Chronicles account has been successfully deleted.
            </p>

            <p>
                If you decide to return, you can create a new account
                using this email address again.
            </p>
        """,
    )

def send_account_created_email(recipient: str, full_name: str) -> None:
    _send_email(
        recipient=recipient,
        subject="Welcome to Chronicles",
        html=f"""
            <h2>Welcome to Chronicles, {full_name}!</h2>

            <p>
                Your Chronicles account has been successfully created.
            </p>

            <p>
                You can now sign in and start keeping track of your
                projects, progress, and work.
            </p>

            <p>
                We're glad to have you here.
            </p>
        """,
    )