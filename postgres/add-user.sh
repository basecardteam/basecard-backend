#!/bin/bash
# Add a new PostgreSQL user
# Usage: ./add-user.sh <username> <password> <database>

set -e

# Configuration
CONTAINER_NAME="homeserver-postgres"
POSTGRES_USER="${POSTGRES_USER:-admin}"

# Parse arguments
NEW_USER="$1"
NEW_PASSWORD="$2"
DATABASE="$3"

if [ -z "$NEW_USER" ] || [ -z "$NEW_PASSWORD" ] || [ -z "$DATABASE" ]; then
    echo "Usage: ./add-user.sh <username> <password> <database>"
    echo ""
    echo "Example:"
    echo "  ./add-user.sh myapp_user mypassword myapp_db"
    echo ""
    echo "This will create:"
    echo "  - User: myapp_user with password: mypassword"
    echo "  - Database: myapp_db (if not exists)"
    echo "  - Grant all privileges on myapp_db to myapp_user"
    exit 1
fi

echo "🔧 Adding user '$NEW_USER' with access to database '$DATABASE'..."

# Create user and database, grant privileges
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" <<EOF
-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$NEW_USER') THEN
        CREATE USER $NEW_USER WITH PASSWORD '$NEW_PASSWORD';
        RAISE NOTICE 'User $NEW_USER created';
    ELSE
        RAISE NOTICE 'User $NEW_USER already exists';
    END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE $DATABASE' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DATABASE')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DATABASE TO $NEW_USER;
EOF

# Grant schema privileges
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$DATABASE" <<EOF
GRANT ALL ON SCHEMA public TO $NEW_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $NEW_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $NEW_USER;
EOF

echo "✅ Done! User '$NEW_USER' can now connect to '$DATABASE'"
echo ""
echo "Connection string:"
echo "  postgresql://$NEW_USER:$NEW_PASSWORD@localhost:5432/$DATABASE"
