#!/bin/bash
# ============================================
# Setup Dev Database for Testnet Testing
# Run this on an existing PostgreSQL container
# ============================================
# Usage: ./setup-dev-db.sh
#
# This creates a separate 'basecard_dev' database for testing
# with testnet contracts without affecting the main database.

set -e

# Load environment variables
if [ -f .env ]; then
    source .env
elif [ -f ../.env ]; then
    source ../.env
fi

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
DEV_DB_NAME="${DEV_DB_NAME:-basecard_dev}"
BACKEND_USER="${BACKEND_USER:-basecard_user}"
AI_AGENT_USER="${AI_AGENT_USER:-ai_agent_user}"

echo "🔧 Setting up Dev Database for Testnet Testing..."
echo "   Container: $CONTAINER_NAME"
echo "   Dev Database: $DEV_DB_NAME"
echo "   Backend User: $BACKEND_USER"
echo "   AI Agent User: $AI_AGENT_USER"
echo ""

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ Error: Container '$CONTAINER_NAME' is not running"
    echo "   Start it with: docker compose up -d"
    exit 1
fi

# Check if dev database already exists
DB_EXISTS=$(docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DEV_DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" = "1" ]; then
    echo "⚠️  Database '$DEV_DB_NAME' already exists"
    read -p "   Drop and recreate? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo "   Dropping existing database..."
        docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -c "DROP DATABASE $DEV_DB_NAME;"
    else
        echo "   Skipping database creation. Updating permissions only..."
    fi
fi

# Create dev database if it doesn't exist
DB_EXISTS=$(docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -tAc "SELECT 1 FROM pg_database WHERE datname='$DEV_DB_NAME'" 2>/dev/null || echo "0")

if [ "$DB_EXISTS" != "1" ]; then
    echo "📦 Creating dev database..."
    docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" <<EOSQL
        CREATE DATABASE $DEV_DB_NAME;
        GRANT ALL PRIVILEGES ON DATABASE $DEV_DB_NAME TO $BACKEND_USER;
        GRANT CONNECT ON DATABASE $DEV_DB_NAME TO $AI_AGENT_USER;
EOSQL
fi

# Set up schemas and permissions
echo "🔑 Setting up schemas and permissions..."
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$DEV_DB_NAME" <<EOSQL
    -- Create Schemas
    CREATE SCHEMA IF NOT EXISTS ai_agent;
    CREATE SCHEMA IF NOT EXISTS drizzle;

    -- Backend user privileges
    GRANT ALL PRIVILEGES ON SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON SCHEMA drizzle TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON SEQUENCES TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $BACKEND_USER;

    -- AI Agent user privileges
    GRANT ALL PRIVILEGES ON SCHEMA ai_agent TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON SEQUENCES TO $AI_AGENT_USER;
    GRANT USAGE ON SCHEMA public TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT REFERENCES ON TABLES TO $AI_AGENT_USER;
EOSQL

echo ""
echo "✅ Dev database setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Dev Connection URLs (for testnet testing):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Backend (.env.dev):"
echo "  DATABASE_URL=postgresql://$BACKEND_USER:\${BACKEND_PASSWORD}@localhost:5432/$DEV_DB_NAME"
echo ""
echo "AI Agent (.env.dev):"
echo "  DATABASE_URL=postgresql://$AI_AGENT_USER:\${AI_AGENT_PASSWORD}@localhost:5432/$DEV_DB_NAME?schema=ai_agent"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Update your backend/.env.dev with the DATABASE_URL above"
echo "  2. Run migrations: cd ../backend && npm run db:migrate"
echo "  3. Seed data if needed: npm run db:seed"
echo ""
