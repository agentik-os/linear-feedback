#!/usr/bin/env bash
# Linear Feedback for Claude Code — Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/agentik-os/linear-feedback/main/install.sh | bash

set -euo pipefail

REPO_URL="https://raw.githubusercontent.com/agentik-os/linear-feedback/main"
CLAUDE_DIR="${HOME}/.claude"
COMMANDS_DIR="${CLAUDE_DIR}/commands"

echo "======================================"
echo "  Linear Feedback for Claude Code"
echo "  by Agentik OS"
echo "======================================"
echo ""

# Create directories
mkdir -p "$COMMANDS_DIR"

# Download the Claude Code command (skill)
echo "Installing /linear-setup command..."
curl -fsSL "${REPO_URL}/commands/linear-setup.md" -o "${COMMANDS_DIR}/linear-setup.md"
echo "  -> ${COMMANDS_DIR}/linear-setup.md"

echo ""
echo "Done! You now have access to /linear-setup in Claude Code."
echo ""
echo "Next steps:"
echo "  1. Open Claude Code in your Next.js project"
echo "  2. Type: /linear-setup"
echo "  3. Claude will ask for your Linear API key"
echo "  4. It will install the widget, API routes, and configure everything"
echo ""
echo "Get your Linear API key at: https://linear.app/settings/api"
echo ""
