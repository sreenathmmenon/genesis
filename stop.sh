#!/bin/bash
echo "Stopping Genesis..."

if [ -f .backend.pid ]; then
  PID=$(cat .backend.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Backend stopped (PID: $PID)"
  fi
  rm -f .backend.pid
fi

if [ -f .frontend.pid ]; then
  PID=$(cat .frontend.pid)
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Frontend stopped (PID: $PID)"
  fi
  rm -f .frontend.pid
fi

# Also kill any orphaned uvicorn/next processes on our ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

docker compose stop
echo "Genesis stopped."
