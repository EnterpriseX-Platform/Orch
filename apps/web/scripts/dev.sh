#!/bin/bash

# Build and Restart Script for Orch

echo "🔄 Stopping existing server..."
pkill -9 -f "next" 2>/dev/null
pkill -9 -f "node.*3047" 2>/dev/null
sleep 2

echo "🚀 Starting Next.js dev server on port 3047..."
cd apps/web
npm run dev -- -p 3047
