#!/bin/bash
# Deploy script for basecard-backend
# This script is called by the deploy webhook to update the running container

set -e

LOG_FILE="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"

echo "=== Deploy started at $(date) ===" | tee -a $LOG_FILE

# Change to deploy directory
cd /home/deploy/basecard-backend || cd /app || {
    echo "ERROR: Could not find deploy directory" | tee -a $LOG_FILE
    exit 1
}

# Load environment variables
if [ -f .env ]; then
    source .env
fi

# Login to GHCR (if credentials provided)
if [ -n "$GHCR_TOKEN" ] && [ -n "$GHCR_USERNAME" ]; then
    echo "Logging in to GHCR..." | tee -a $LOG_FILE
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin 2>&1 | tee -a $LOG_FILE
else
    echo "WARN: GHCR credentials not found, skipping login" | tee -a $LOG_FILE
fi

echo "Pulling latest image..." | tee -a $LOG_FILE
docker compose -f docker-compose.prod.yml pull 2>&1 | tee -a $LOG_FILE

echo "Restarting containers..." | tee -a $LOG_FILE
docker compose -f docker-compose.prod.yml up -d 2>&1 | tee -a $LOG_FILE

echo "Cleaning up old images..." | tee -a $LOG_FILE
docker image prune -f 2>&1 | tee -a $LOG_FILE

echo "=== Deploy completed at $(date) ===" | tee -a $LOG_FILE

