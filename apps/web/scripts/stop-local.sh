#!/bin/bash

echo "🛑 Stopping Local Development..."
echo ""

# Stop Docker infrastructure
echo "  Stopping Docker containers..."
docker compose down 2>&1 | grep -v "version is obsolete" || true

echo ""
echo "✅ All services stopped"
