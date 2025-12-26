#!/bin/bash
# Update PostgreSQL permissions (run locally after DB already exists)
# Usage: ./update_db.sh

set -e

# Load environment variables
if [ -f .env ]; then
    source .env
elif [ -f ../.env ]; then
    source ../.env
fi

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-homeserver-postgres}"
POSTGRES_USER="${POSTGRES_USER:-admin}"
DB_NAME="${POSTGRES_DB:-basecard}"
BACKEND_USER="${BACKEND_USER:-basecard_user}"
AI_AGENT_USER="${AI_AGENT_USER:-ai_agent_user}"

echo "🔧 Updating PostgreSQL permissions..."
echo "   Container: $CONTAINER_NAME"
echo "   Database: $DB_NAME"
echo "   Backend User: $BACKEND_USER"
echo "   AI Agent User: $AI_AGENT_USER"
echo ""

# Update permissions via docker exec
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$DB_NAME" <<EOSQL
    -- ============================================
    -- Create Schemas (if not exists)
    -- ============================================
    CREATE SCHEMA IF NOT EXISTS ai_agent;
    CREATE SCHEMA IF NOT EXISTS drizzle;

    -- ============================================
    -- Backend User Privileges
    -- ============================================
    GRANT ALL PRIVILEGES ON SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON SCHEMA drizzle TO $BACKEND_USER;
    
    -- Default privileges for future tables
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT ALL ON SEQUENCES TO $BACKEND_USER;
    
    -- Existing tables
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA drizzle TO $BACKEND_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA drizzle TO $BACKEND_USER;

    -- ============================================
    -- AI Agent User Privileges
    -- ============================================
    GRANT ALL PRIVILEGES ON SCHEMA ai_agent TO $AI_AGENT_USER;
    
    -- Default privileges for ai_agent schema
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON SEQUENCES TO $AI_AGENT_USER;
    
    -- Existing tables in ai_agent schema
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ai_agent TO $AI_AGENT_USER;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ai_agent TO $AI_AGENT_USER;
    
    -- Access to public schema for foreign key references
    GRANT USAGE ON SCHEMA public TO $AI_AGENT_USER;
    
    -- Default privileges on public tables (SELECT + REFERENCES)
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT REFERENCES ON TABLES TO $AI_AGENT_USER;
    
    -- Existing public tables (SELECT + REFERENCES)
    GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA public TO $AI_AGENT_USER;

EOSQL

echo ""
echo "✅ Permissions updated successfully!"
