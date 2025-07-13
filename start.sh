#!/bin/bash

# Biographer AI Startup Script
# This script starts both the backend and frontend services

set -e

echo "🚀 Starting Biographer AI..."

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists python3; then
    echo "❌ Python 3 is required but not installed."
    echo "Install with: brew install python (macOS) or paru -S python (Arch Linux)"
    exit 1
fi

if ! command_exists node; then
    echo "❌ Node.js is required but not installed."
    echo "Install with: brew install node (macOS) or paru -S nodejs npm (Arch Linux)"
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm is required but not installed."
    echo "Install with: brew install node (macOS) or paru -S nodejs npm (Arch Linux)"
    exit 1
fi

echo "✅ All prerequisites found"

# Setup backend if needed
if [ ! -d "backend/venv" ]; then
    echo "🔧 Setting up backend virtual environment..."
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cd ..
    echo "✅ Backend setup complete"
fi

# Setup frontend if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "🔧 Setting up frontend dependencies..."
    cd frontend
    npm install
    cd ..
    echo "✅ Frontend setup complete"
fi

# Start backend in background
echo "🖥️  Starting backend server..."
cd backend
source venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend server started (PID: $BACKEND_PID)"
else
    echo "❌ Backend failed to start"
    exit 1
fi

# Start frontend
echo "🌐 Starting frontend..."
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "🎉 Biographer AI is starting up!"
echo ""
echo "📍 Backend:  http://localhost:8000"
echo "📍 Frontend: http://localhost:3000"
echo ""
echo "The frontend should open automatically in your browser."
echo ""
echo "To stop the application:"
echo "  Press Ctrl+C or run: kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "💡 Don't forget to configure your LLM provider in the Configuration tab!"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down Biographer AI..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "✅ Shutdown complete"
}

# Set trap to cleanup on script exit
trap cleanup EXIT

# Wait for user to stop
wait