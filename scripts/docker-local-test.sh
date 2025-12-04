#!/bin/bash

# Stop any running containers
echo "Stopping existing containers..."
docker compose down

# Build and start the containers
echo "Building and starting Docker containers..."
docker compose up --build -d

# Show logs
echo "Containers started. Tailing logs (Ctrl+C to exit logs, containers will keep running)..."
docker compose logs -f basecard-backend
