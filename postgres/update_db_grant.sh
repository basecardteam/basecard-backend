#!/bin/bash
# Update PostgreSQL GRANT permissions for ai_agent_user
# Run this after tables already exist and ai_agent_user needs access
# Usage: ./update_db_grant.sh

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
AI_AGENT_USER="${AI_AGENT_USER:-ai_agent_user}"

echo "🔐 Granting permissions to AI Agent user..."
echo "   Container: $CONTAINER_NAME"
echo "   Database: $DB_NAME"
echo "   AI Agent User: $AI_AGENT_USER"
echo ""

# Grant permissions via docker exec
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$DB_NAME" <<EOSQL
    -- ============================================
    -- AI Agent User Privileges
    -- ============================================
    
    -- Access to public schema
    GRANT USAGE ON SCHEMA public TO $AI_AGENT_USER;
    
    -- Grant SELECT/REFERENCES on ALL EXISTING tables in public schema
    GRANT SELECT, REFERENCES ON ALL TABLES IN SCHEMA public TO $AI_AGENT_USER;
    
    -- Default privileges for FUTURE tables in public schema
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT REFERENCES ON TABLES TO $AI_AGENT_USER;

EOSQL

echo ""
echo "✅ AI Agent permissions granted successfully!"
echo ""
echo "You can now access public tables with SELECT/REFERENCES as $AI_AGENT_USER"
