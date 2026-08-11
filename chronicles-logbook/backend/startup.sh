#!/bin/bash
# Azure App Service (Linux, Python runtime) runs this as the startup command.
# Set it in: Azure Portal > your backend Web App > Configuration > General
# settings > Startup Command, as:
#   bash startup.sh
#
# Gunicorn manages worker processes; each worker runs uvicorn's ASGI worker
# class so FastAPI's async routes work correctly. $PORT is injected by
# App Service — don't hard-code 8000 here.
gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers 2 \
  --bind 0.0.0.0:${PORT:-8000} \
  --timeout 120
