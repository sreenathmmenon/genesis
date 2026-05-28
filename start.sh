#!/bin/bash
set -e

echo "Starting Genesis..."

# Load env
set -a
source .env
set +a

# Create log directory
mkdir -p backend/logs

# Start infrastructure if not running
docker compose up -d
echo "Infrastructure running (Postgres, Redis, Qdrant)"

# Wait for Postgres to be healthy before starting backend
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-genesis}" >/dev/null 2>&1; do
  sleep 1
done

# Start backend
echo "Starting FastAPI backend..."
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
  --log-config /dev/null \
  2>&1 | tee logs/genesis.log &
BACKEND_PID=$!
cd ..
echo "$BACKEND_PID" > .backend.pid
echo "Backend running at http://localhost:8000 (PID: $BACKEND_PID)"

# Wait briefly for backend to bind
sleep 2

# Start frontend
echo "Starting Next.js frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..
echo "$FRONTEND_PID" > .frontend.pid
echo "Frontend running at http://localhost:3000 (PID: $FRONTEND_PID)"

echo ""
echo "Genesis is running!"
echo "  Canvas:     http://localhost:3000"
echo "  API docs:   http://localhost:8000/docs"
echo "  API health: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C or run ./stop.sh to stop."

# Trap Ctrl+C and clean up
trap './stop.sh' INT TERM

wait $BACKEND_PID $FRONTEND_PID
