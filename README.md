# StoryDesk

StoryDesk is a local macOS prototype that creates a virtual display, captures it, and streams it to browser receivers or Google Cast devices on the same LAN.

It now includes an Autopilot foundation: Electron main owns an agent orchestrator, the renderer publishes typed runtime state, and the agent can request approved tools such as starting the virtual display, refreshing sources, starting the browser stream, opening the receiver URL, scanning Cast devices, and collecting diagnostics.

## Requirements

- macOS 13 or newer
- Node.js 22+
- Apple Command Line Tools with `swiftc`
- Screen Recording permission for Electron after first launch

## Run

```bash
npm install
npm run dev
```

The app starts a local receiver server automatically. Use the QR code or receiver URL shown in the app for browser receivers.

## Fire Stick / TV Browser Receiver

For Fire TV and Fire Stick devices, open Amazon Silk or another TV browser and enter the TV URL shown in StoryDesk:

```text
http://<your-mac-ip>:<port>/tv
```

Then enter the six-character code displayed in the StoryDesk `TV / Fire Stick` panel. The TV page redirects to the live browser receiver.

Use `Compatibility` on the TV page if the TV browser struggles with WebRTC. That path opens a motion-JPEG fallback receiver at:

```text
http://<your-mac-ip>:<port>/fallback/<session-token>
```

Compatibility mode is slower and lower bandwidth than WebRTC, but it uses a very simple image stream that works in more embedded browsers.

## Build And Test

```bash
npm run build
npm test
npm run test:e2e
```

## Current MVP Bounds

- Video-only capture
- Local network only
- Browser receiver via WebRTC
- Browser receiver status, reconnect, ping latency, and basic bitrate/frame metrics
- Fire Stick and TV-browser join flow via `/tv`, six-character codes, direct `/go/<code>` links, and MJPEG compatibility receiver fallback
- Provider-pluggable Autopilot with a deterministic local provider by default
- Chromecast path uses Cast discovery/control plus a chunked WebM live endpoint fed by Electron's MediaRecorder
- No DriverKit system extension
- No Mac App Store packaging
