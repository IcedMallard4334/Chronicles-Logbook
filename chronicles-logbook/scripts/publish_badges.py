"""Commits generated coverage badge SVGs into badges/ and pushes to main.

Written in Python (not inline shell) so it doesn't depend on
bash-specific syntax (command substitution, ${VAR#prefix} trimming),
which makes it portable across whatever shell the Windows Gitea Actions
runner happens to default to.

Usage:
    publish_badges.py <backend_svg_src> <frontend_svg_src>

Expects GITEA_TOKEN, GITHUB_SERVER_URL, and GITHUB_REPOSITORY in the
environment (all auto-provided by Gitea Actions). Run from the repo
root (no working-directory override).
"""

import os
import shutil
import subprocess
import sys


def run(*args: str) -> None:
    print("+", " ".join(args))
    subprocess.run(args, check=True)


def main() -> None:
    if len(sys.argv) != 3:
        print(
            "Usage: publish_badges.py <backend_svg_src> <frontend_svg_src>",
            file=sys.stderr,
        )
        sys.exit(1)
    backend_src, frontend_src = sys.argv[1], sys.argv[2]

    os.makedirs("badges", exist_ok=True)
    shutil.copyfile(backend_src, os.path.join("badges", "backend-coverage.svg"))
    shutil.copyfile(frontend_src, os.path.join("badges", "frontend-coverage.svg"))

    run("git", "config", "user.name", "coverage-bot")
    run("git", "config", "user.email", "coverage-bot@users.noreply.local")
    run("git", "add", "badges")

    diff = subprocess.run(["git", "diff", "--cached", "--quiet"])
    if diff.returncode == 0:
        print("No badge changes to commit.")
        return

    run("git", "commit", "-m", "chore: update coverage badges [skip ci]")

    token = os.environ["GITEA_TOKEN"]
    server_url = os.environ["GITHUB_SERVER_URL"]
    repo = os.environ["GITHUB_REPOSITORY"]
    host = server_url.removeprefix("https://").removeprefix("http://")
    remote = f"https://x-access-token:{token}@{host}/{repo}.git"

    run("git", "push", remote, "HEAD:main")


if __name__ == "__main__":
    main()