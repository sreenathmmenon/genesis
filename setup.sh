#!/bin/bash
set -e

echo "Setting up Genesis..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker not found. Install Docker Desktop."; exit 1; }
command -v uv >/dev/null 2>&1 || { echo "uv not found. Run: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js not found. Install Node 20+."; exit 1; }

# Verify Node version >= 20
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ required. Found: $(node --version)"
  exit 1
fi

# Copy env files
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — add your API keys before running start.sh"
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.local.example frontend/.env.local
fi

# Backend: create virtual env and install deps
echo "Installing Python dependencies..."
cd backend
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
cd ..

# Frontend: install node deps
echo "Installing Node.js dependencies..."
cd frontend
npm install
cd ..

# Create log directory
mkdir -p backend/logs

# Start infrastructure
echo "Starting PostgreSQL, Redis, Qdrant..."
docker compose up -d

# Wait for Postgres to be healthy
echo "Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U genesis >/dev/null 2>&1; do
  sleep 1
done

# Run migrations
echo "Running database migrations..."
cd backend
source .venv/bin/activate
alembic upgrade head
cd ..

echo ""
echo "Genesis setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env — add ANTHROPIC_API_KEY and TELEGRAM_BOT_TOKEN"
echo "  2. Run: ./start.sh"
echo "  3. Open: http://localhost:3000"
