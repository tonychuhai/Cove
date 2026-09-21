#!/bin/sh
# Build the wallpaper agent, install it in ~/Applications with its own copy of the
# scenes, and start it now and at every login.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
project=$(dirname "$here")
label=com.tonyzhu.cove
app="$HOME/Applications/Cove.app"
agent="$HOME/Library/LaunchAgents/$label.plist"
domain="gui/$(id -u)"

if ! command -v swiftc >/dev/null; then
	echo "swiftc is missing. Install the Xcode command line tools: xcode-select --install" >&2
	exit 1
fi

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
# Built for this machine's own architecture; the binary never leaves it.
swiftc -O -target "$(uname -m)-apple-macos13.0" -o "$build/Cove" \
	"$here/Wallpaper.swift" -framework Cocoa -framework WebKit -framework IOKit

# Replace installations made under the project's earlier names. Desktop Habitats'
# settings (the chosen scene, pause, the rabbit's memory) are carried over.
for old in com.chaselean.aquatica com.chaselean.desktop-habitats; do
	launchctl bootout "$domain/$old" 2>/dev/null || true
	rm -f "$HOME/Library/LaunchAgents/$old.plist"
done
rm -rf "$HOME/Applications/Aquatica.app" "$HOME/Applications/Desktop Habitats.app"
if defaults read com.chaselean.desktop-habitats >/dev/null 2>&1 &&
	! defaults read "$label" >/dev/null 2>&1; then
	defaults export com.chaselean.desktop-habitats - | defaults import "$label" - 2>/dev/null || true
fi

launchctl bootout "$domain/$label" 2>/dev/null || true

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/scene/scenes"
cp "$build/Cove" "$app/Contents/MacOS/Cove"
cp "$here/Info.plist" "$app/Contents/Info.plist"
for scene in "$project"/scenes/*/; do
	# Without the trailing slash, or cp would pour the folder's contents into scenes/.
	cp -R "${scene%/}" "$app/Contents/Resources/scene/scenes/"
done
cp -R "$project/vendor" "$app/Contents/Resources/scene/"
rm -rf "$app/Contents/Resources/scene/scenes/"*/tests
codesign --force --sign - "$app" >/dev/null 2>&1 || true

mkdir -p "$(dirname "$agent")"
cat >"$agent" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$label</string>
	<key>ProgramArguments</key>
	<array>
		<string>$app/Contents/MacOS/Cove</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>StandardErrorPath</key>
	<string>/tmp/cove.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "$domain" "$agent"
launchctl kickstart -k "$domain/$label"

# The desktop picture behind the live layer: what login, Mission Control and Stage Manager
# show before the scene is drawing. It is a frame of the scene itself.
still="$HOME/Pictures/Cove.png"
mkdir -p "$HOME/Pictures"
echo "Waiting for the first frame, then setting the still picture."
sleep 8
if pid=$(pgrep -n -f "Cove.app/Contents/MacOS/Cove"); then
	kill -USR1 "$pid" && sleep 7
	if [ -s /tmp/cove.png ]; then
		cp /tmp/cove.png "$still"
		osascript -e "tell application \"System Events\" to tell every desktop to set picture to \"$still\"" >/dev/null 2>&1 ||
			echo "Could not set the still picture; the live layer covers it anyway."
	fi
fi

echo "Cove installed: $app"
