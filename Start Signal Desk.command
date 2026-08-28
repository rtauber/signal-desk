#!/bin/bash
# Double-click this file to launch The Signal Desk.
# It starts the app and opens the dashboard in your browser automatically.

# Move into this launcher's own folder (so it always finds the app files).
cd "$(dirname "$0")" || exit 1

echo ""
echo "  =============================================="
echo "     THE SIGNAL DESK"
echo "  =============================================="
echo ""

# 1. Make sure Node.js is installed.
if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js isn't installed yet — the app needs it to run."
  echo ""
  echo "  1. Go to https://nodejs.org"
  echo "  2. Click the big green 'LTS' download button, install it"
  echo "  3. Double-click this launcher again"
  echo ""
  echo "  Press any key to close this window."
  read -n 1 -s
  exit 1
fi

# 2. First-time setup: install the app's parts if they're missing.
if [ ! -d "node_modules" ]; then
  echo "  First-time setup — getting things ready (about a minute)..."
  echo ""
  if ! npm install; then
    echo ""
    echo "  Setup hit a snag. Copy the messages above and send them to Claude."
    echo "  Press any key to close this window."
    read -n 1 -s
    exit 1
  fi
  echo ""
fi

# 3. As soon as the server is ready, open the dashboard in the browser.
(
  for i in $(seq 1 40); do
    if curl -s -o /dev/null "http://localhost:3000"; then
      open "http://localhost:3000"
      break
    fi
    sleep 0.5
  done
) &

echo "  Starting up — your dashboard will open in the browser in a moment."
echo ""
echo "  * Keep this window open while you're using the dashboard."
echo "  * To quit: close this window (click Terminate if asked)."
echo ""
echo "  ----------------------------------------------"
echo ""

# 4. Start the server (stays running until you close the window).
npm start
