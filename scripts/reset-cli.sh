#!/bin/bash

# This script is used to reset the CLI package to a fresh state.
# It's useful when you want to start fresh with the CLI package.

# Define yellow color for echo statements
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_yellow() {
  echo -e "${YELLOW}$1${NC}"
}

echo_yellow "Resetting CLI package to a fresh state..."

echo_yellow "Removing node_modules..."

rm -rf node_modules/
rm -rf resync-cli/node_modules/

echo_yellow "Installing dependencies..."

# Install the dependencies
bun install

echo_yellow "Building the CLI package..."

# Go to the resync-cli directory
cd resync-cli
# Build the resync-cli package
bun run build
# Install the dependencies
bun install
# Go back to the root directory
cd ..

echo_yellow "Done. Happy dev'ing!"
