#!/bin/bash
set -e

# ============================================
# PostgreSQL Dev Database Initialization
# Creates a separate database for testing with testnet contracts
# ============================================

# Skip if DEV_DB is not enabled
if [ "${ENABLE_DEV_DB}" != "true" ]; then
    echo "⏭️  Dev database creation skipped (ENABLE_DEV_DB != true)"
    exit 0
fi

echo "🚀 Initializing Dev Database..."

# Use environment variables with defaults
DEV_DB_NAME="${DEV_DB_NAME:-basecard_dev}"
BACKEND_USER="${BACKEND_USER:-basecard_user}"
BACKEND_PASSWORD="${BACKEND_PASSWORD:-basecard_password}"
AI_AGENT_USER="${AI_AGENT_USER:-ai_agent_user}"
AI_AGENT_PASSWORD="${AI_AGENT_PASSWORD:-ai_agent_password}"

echo "📦 Dev Database: $DEV_DB_NAME"
echo "👤 Backend User: $BACKEND_USER"
echo "👤 AI Agent User: $AI_AGENT_USER"

# Create dev database and set up permissions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- ============================================
    -- Create Dev Database
    -- ============================================
    CREATE DATABASE $DEV_DB_NAME;

    -- ============================================
    -- Grant Database Access
    -- ============================================
    GRANT ALL PRIVILEGES ON DATABASE $DEV_DB_NAME TO $BACKEND_USER;
    GRANT CONNECT ON DATABASE $DEV_DB_NAME TO $AI_AGENT_USER;
EOSQL

# Set up schemas and permissions in dev database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DEV_DB_NAME" <<-EOSQL
    -- ============================================
    -- Create Schemas
    -- ============================================
    CREATE SCHEMA IF NOT EXISTS ai_agent;
    CREATE SCHEMA IF NOT EXISTS drizzle;

    -- ============================================
    -- Grant Privileges (same as production)
    -- ============================================
    -- Backend user: full access to public schema + drizzle schema for migrations
    GRANT ALL PRIVILEGES ON SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON SCHEMA drizzle TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON SEQUENCES TO $BACKEND_USER;

    -- AI Agent user: full access to ai_agent schema
    GRANT ALL PRIVILEGES ON SCHEMA ai_agent TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON SEQUENCES TO $AI_AGENT_USER;

    -- AI Agent needs access to public schema for foreign key references
    GRANT USAGE ON SCHEMA public TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT REFERENCES ON TABLES TO $AI_AGENT_USER;

EOSQL

echo "✅ Dev database initialization complete!"
echo ""
echo "Dev Connection URLs:"
echo "  Backend:   postgresql://$BACKEND_USER:****@localhost:5432/$DEV_DB_NAME"
echo "  AI Agent:  postgresql://$AI_AGENT_USER:****@localhost:5432/$DEV_DB_NAME?schema=ai_agent"
