#!/bin/sh
# Stop the wallpaper agent and remove it. The desktop falls back to its still picture.
set -eu

label=com.tonyzhu.cove
agent="$HOME/Library/LaunchAgents/$label.plist"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
rm -f "$agent"
rm -rf "$HOME/Applications/Cove.app"
rm -rf "$HOME/Library/Application Support/Cove"
echo "Cove removed. Pick a wallpaper in System Settings; the desktop picture pointed at Cove's still frame."
