#!/bin/bash
set -e

# ============================================
# PostgreSQL Initialization Script
# Creates users and schemas for services
# ============================================

echo "🚀 Initializing PostgreSQL..."

# Use environment variables with defaults
DB_NAME="${POSTGRES_DB:-basecard}"
BACKEND_USER="${BACKEND_USER:-basecard_user}"
BACKEND_PASSWORD="${BACKEND_PASSWORD:-basecard_password}"
AI_AGENT_USER="${AI_AGENT_USER:-ai_agent_user}"
AI_AGENT_PASSWORD="${AI_AGENT_PASSWORD:-ai_agent_password}"

echo "📦 Database: $DB_NAME"
echo "👤 Backend User: $BACKEND_USER"
echo "👤 AI Agent User: $AI_AGENT_USER"

# Create users and schemas
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DB_NAME" <<-EOSQL
    -- ============================================
    -- Create Users
    -- ============================================
    CREATE USER $BACKEND_USER WITH PASSWORD '$BACKEND_PASSWORD';
    CREATE USER $AI_AGENT_USER WITH PASSWORD '$AI_AGENT_PASSWORD';

    -- ============================================
    -- Create Schemas
    -- ============================================
    -- AI Agent gets its own schema
    CREATE SCHEMA IF NOT EXISTS ai_agent;

    -- ============================================
    -- Grant Privileges
    -- ============================================
    -- Backend user: full access to public schema
    GRANT ALL PRIVILEGES ON SCHEMA public TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $BACKEND_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $BACKEND_USER;

    -- AI Agent user: full access to ai_agent schema
    GRANT ALL PRIVILEGES ON SCHEMA ai_agent TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON TABLES TO $AI_AGENT_USER;
    ALTER DEFAULT PRIVILEGES IN SCHEMA ai_agent GRANT ALL ON SEQUENCES TO $AI_AGENT_USER;
    
    -- AI Agent also needs USAGE on public schema (for shared tables if needed)
    GRANT USAGE ON SCHEMA public TO $AI_AGENT_USER;

EOSQL

echo "✅ PostgreSQL initialization complete!"
echo ""
echo "Connection URLs:"
echo "  Backend:   postgresql://$BACKEND_USER:****@localhost:5432/$DB_NAME"
echo "  AI Agent:  postgresql://$AI_AGENT_USER:****@localhost:5432/$DB_NAME?schema=ai_agent"
