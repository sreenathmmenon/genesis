.PHONY: setup start stop test test-unit test-integration test-e2e migrate migrate-create logs-backend infra-up infra-down infra-reset shell clean

setup:
	chmod +x setup.sh start.sh stop.sh
	./setup.sh

start:
	./start.sh

stop:
	./stop.sh

test:
	cd backend && source .venv/bin/activate && pytest tests/ -v

test-unit:
	cd backend && source .venv/bin/activate && pytest tests/unit/ -v

test-integration:
	cd backend && source .venv/bin/activate && pytest tests/integration/ -v

test-e2e:
	cd backend && source .venv/bin/activate && pytest tests/e2e/ -v --timeout=60

migrate:
	cd backend && source .venv/bin/activate && alembic upgrade head

migrate-create:
	cd backend && source .venv/bin/activate && alembic revision --autogenerate -m "$(name)"

logs-backend:
	tail -f backend/logs/genesis.log

infra-up:
	docker compose up -d

infra-down:
	docker compose stop

infra-reset:
	docker compose down -v && docker compose up -d

shell:
	cd backend && source .venv/bin/activate && python

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -name ".DS_Store" -delete 2>/dev/null || true
