#!/bin/bash
# Reset PostgreSQL data directory
# Usage: ./reset-dir.sh
# WARNING: This will DELETE all data!

set -e

# Load environment variables
if [ -f .env ]; then
    source .env
fi

POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/data2/postgres}"
CONTAINER_NAME="homeserver-postgres"

echo "⚠️  WARNING: This will DELETE all PostgreSQL data!"
echo "   Directory: $POSTGRES_DATA_DIR"
echo ""
read -p "Are you sure? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "🛑 Stopping container..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

echo "🗑️  Removing data directory..."
sudo rm -rf "$POSTGRES_DATA_DIR"

echo "📁 Recreating data directory..."
sudo mkdir -p "$POSTGRES_DATA_DIR"
sudo chown -R 999:999 "$POSTGRES_DATA_DIR"  # postgres container UID

echo "✅ Done! Run 'docker compose up -d' to reinitialize."
