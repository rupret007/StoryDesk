# StoryDesk

Local macOS prototype: create a virtual display, capture it, and stream it to browser receivers or Chromecast devices on the same LAN.

Public repo. Video-only, LAN-only. Not signed, notarized, or Mac App Store packaged.

[![CI](https://github.com/rupret007/StoryDesk/actions/workflows/ci.yml/badge.svg)](https://github.com/rupret007/StoryDesk/actions/workflows/ci.yml)

## Features

- Virtual display via an unsigned Swift helper (DeskPad-style private CoreGraphics APIs)
- Browser WebRTC receiver with QR/URL, reconnect, ping latency, and bitrate/frame metrics
- Fire Stick / TV join: `/tv`, six-character codes, `/go/<code>`, MJPEG compatibility fallback
- Chromecast discovery/control plus a chunked WebM live endpoint from Electron's MediaRecorder
- Autopilot foundation: Electron-owned orchestrator, typed runtime state, approved tools (start/stop display and stream, refresh sources, open receiver URL, scan Cast, diagnostics). Local deterministic provider by default; OpenAI-compatible adapter exists, but credential entry and secure storage are not productized
- Named, focused StoryDesk window with labeled primary controls
- Cryptographic session and receiver IDs; signaling keeps a reconnected receiver when the previous socket closes

## Requirements

- macOS 13 or newer
- Node.js 22+ (see `.nvmrc`)
- Apple Command Line Tools with `swiftc`
- Screen Recording permission for Electron after first launch

## Quick start

```bash
npm ci
npm run dev
```

`npm install` also works for a first clone. The app starts a local receiver server; use the QR code or receiver URL in the window.

Closing the StoryDesk window stops active sessions, removes the virtual display, and quits.

## Fire Stick / TV browser

On Fire TV or Fire Stick, open Amazon Silk (or another TV browser) and enter the TV URL shown in StoryDesk:

```text
http://<your-mac-ip>:<port>/tv
```

Enter the six-character code from the `TV / Fire Stick` panel. The page redirects to the live browser receiver.

Use **Compatibility** if the TV browser struggles with WebRTC. That opens a motion-JPEG fallback:

```text
http://<your-mac-ip>:<port>/fallback/<session-token>
```

Compatibility mode is slower and lower bandwidth than WebRTC, but it is a simple image stream that works in more embedded browsers.

## Build and test

PR gate (same as Ubuntu CI):

```bash
npm run typecheck
npm test
```

Full macOS build (unsigned Swift helper, no codesign or notarize):

```bash
npm run build
```

That runs `build:helper` (`swiftc`), `build:renderer` (Vite), and `build:electron`. Linux CI compiles renderer + Electron only; the helper needs macOS.

Optional Playwright (not in CI):

```bash
npx playwright install chromium
npm run test:e2e
```

CI runs on every pull request and on pushes to `main`:

- Node.js 22 from `.nvmrc` with `npm ci` and the npm cache
- Ubuntu 24.04: typecheck, unit tests, renderer + Electron compile
- macOS: renderer, Electron, and unsigned Swift helper (`CSC_IDENTITY_AUTO_DISCOVERY=false`; no codesign, notarize, or Apple secrets)

## Limits

- Video-only capture, trusted LAN only
- Receiver URL and six-character TV code grant access to the current session — treat them as private
- Stopping the stream or quitting closes Cast/fallback streams and clears retained fallback frames
- No DriverKit system extension
- Virtual display helper reuses DeskPad's approach (MIT). See `THIRD_PARTY_NOTICES.md`
