import type { Session } from "../lib/types";

export function renderReceiverPage(token: string) {
  const safeToken = JSON.stringify(token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StoryDesk Receiver</title>
    <style>
      :root { color: #f6f3eb; background: #0d1210; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { align-items: center; display: flex; height: 100vh; justify-content: center; margin: 0; overflow: hidden; }
      video { background: #050706; height: 100vh; object-fit: contain; width: 100vw; }
      #status { background: rgba(13, 18, 16, 0.78); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; color: #f6f3eb; font-weight: 800; left: 18px; padding: 10px 12px; position: fixed; top: 18px; }
    </style>
  </head>
  <body>
    <video id="screen" autoplay playsinline></video>
    <div id="status">Connecting</div>
    <script>
      const token = ${safeToken};
      const status = document.getElementById("status");
      const video = document.getElementById("screen");
      const receiverId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
      const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
      let ws;
      let peer;
      let retryMs = 500;
      let statsTimer;
      let lastFrames = 0;
      let lastBytes = 0;
      let lastStatsAt = performance.now();
      let pendingCandidates = [];

      function setStatus(value) {
        status.textContent = value;
      }

      function send(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data));
        }
      }

      function createPeer() {
        if (peer) {
          peer.close();
        }
        clearInterval(statsTimer);
        pendingCandidates = [];
        lastFrames = 0;
        lastBytes = 0;
        lastStatsAt = performance.now();
        peer = new RTCPeerConnection({ iceServers: [] });
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.ontrack = (event) => {
          video.srcObject = event.streams[0];
          setStatus("Live");
          startStats();
        };
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            send({ type: "signal", target: "host", data: { type: "ice", candidate: event.candidate } });
          }
        };
        peer.onconnectionstatechange = () => {
          setStatus(peer.connectionState === "connected" ? "Live" : peer.connectionState);
        };
      }

      async function negotiate() {
        createPeer();
        setStatus("Negotiating");
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        send({ type: "signal", target: "host", data: { type: "offer", sdp: offer.sdp } });
      }

      function connect() {
        ws = new WebSocket(wsProtocol + "//" + location.host + "/ws?role=receiver&token=" + token + "&id=" + receiverId);
        ws.onopen = () => {
          retryMs = 500;
          setStatus("Waiting for stream");
        };
        ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "host-ready") {
              await negotiate();
              return;
            }
            if (message.type === "receiver-ping") {
              send({ type: "receiver-pong", target: "host", data: message.data });
              return;
            }
            if (message.type !== "signal" || !peer) return;
            if (message.data?.type === "answer") {
              await peer.setRemoteDescription({ type: "answer", sdp: message.data.sdp });
              const candidates = pendingCandidates.splice(0);
              for (const candidate of candidates) {
                await peer.addIceCandidate(candidate);
              }
            }
            if (message.data?.type === "ice" && message.data.candidate) {
              if (peer.remoteDescription) {
                await peer.addIceCandidate(message.data.candidate);
              } else {
                pendingCandidates.push(message.data.candidate);
              }
            }
          } catch (error) {
            setStatus("Error");
            console.error(error);
          }
        };
        ws.onclose = () => {
          setStatus("Reconnecting");
          clearInterval(statsTimer);
          peer?.close();
          peer = null;
          window.setTimeout(connect, retryMs);
          retryMs = Math.min(5000, retryMs * 1.7);
        };
        ws.onerror = () => {
          setStatus("Error");
        };
      }

      function startStats() {
        clearInterval(statsTimer);
        statsTimer = window.setInterval(async () => {
          if (!peer) return;
          const stats = await peer.getStats();
          let frames = 0;
          let bytes = 0;
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
              frames += report.framesDecoded || 0;
              bytes += report.bytesReceived || 0;
            }
          });
          const now = performance.now();
          const seconds = Math.max(0.001, (now - lastStatsAt) / 1000);
          const frameRate = Math.max(0, Math.round((frames - lastFrames) / seconds));
          const bitrateKbps = Math.max(0, Math.round(((bytes - lastBytes) * 8) / seconds / 1000));
          lastFrames = frames;
          lastBytes = bytes;
          lastStatsAt = now;
          send({ type: "receiver-metrics", target: "host", data: { frameRate, bitrateKbps } });
        }, 1000);
      }

      connect();
    </script>
  </body>
</html>`;
}

export function renderFallbackReceiverPage(token: string) {
  const safeToken = encodeURIComponent(token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StoryDesk Compatibility Receiver</title>
    <style>
      :root { color: #f6f3eb; background: #0d1210; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { align-items: center; display: flex; height: 100vh; justify-content: center; margin: 0; overflow: hidden; }
      img { background: #050706; height: 100vh; object-fit: contain; width: 100vw; }
      #status { background: rgba(13, 18, 16, 0.78); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 8px; color: #f6f3eb; font-weight: 800; left: 18px; padding: 10px 12px; position: fixed; top: 18px; }
    </style>
  </head>
  <body>
    <img id="screen" src="/fallback/${safeToken}/live.mjpg" alt="" />
    <div id="status">Waiting</div>
    <script>
      const image = document.getElementById("screen");
      const status = document.getElementById("status");
      const setStatus = (value) => { status.textContent = value; };
      image.addEventListener("load", () => setStatus("Live"));
      image.addEventListener("error", () => setStatus("Reconnecting"));
      window.setInterval(async () => {
        try {
          await fetch("/health", { cache: "no-store" });
          if (status.textContent === "Reconnecting") setStatus("Waiting");
        } catch {
          setStatus("Offline");
        }
      }, 1500);
    </script>
  </body>
</html>`;
}

export function renderTvJoinPage(session: Session, errorMessage = "") {
  const safeError = escapeHtml(errorMessage);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StoryDesk TV Join</title>
    <style>
      :root { color: #f7f2e9; background: #07120f; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { align-items: center; background: radial-gradient(circle at 50% 15%, #183f36, #07120f 58%); display: flex; min-height: 100vh; justify-content: center; margin: 0; padding: 28px; }
      main { max-width: 760px; text-align: center; width: 100%; }
      h1 { font-size: clamp(42px, 8vw, 82px); line-height: 1; margin: 0 0 18px; }
      p { color: #cbd8d2; font-size: clamp(18px, 2.8vw, 28px); margin: 0 0 28px; }
      form { display: grid; gap: 18px; }
      input { background: #f9f5ec; border: 4px solid #8fd3bb; border-radius: 10px; color: #07120f; font-size: clamp(36px, 9vw, 84px); font-weight: 900; height: clamp(84px, 16vw, 132px); letter-spacing: 0; padding: 0 24px; text-align: center; text-transform: uppercase; width: 100%; }
      button { background: #8fd3bb; border: 0; border-radius: 10px; color: #07120f; cursor: pointer; font-size: clamp(24px, 4vw, 40px); font-weight: 900; min-height: 72px; padding: 18px 28px; }
      button.secondary { background: #f9f5ec; color: #07120f; }
      .hint { color: #9eb6ae; font-size: clamp(15px, 2vw, 20px); margin-top: 24px; }
      .error { background: rgba(198, 58, 42, 0.18); border: 2px solid #f09a8d; border-radius: 10px; color: #ffd8d2; font-size: clamp(16px, 2.4vw, 24px); font-weight: 800; margin-bottom: 18px; padding: 12px; }
      .button-grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
      .code { color: #8fd3bb; font-weight: 900; letter-spacing: 0; }
      @media (max-width: 520px) { .button-grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>StoryDesk</h1>
      <p>Enter the code from your Mac.</p>
      ${safeError ? `<div class="error">${safeError}</div>` : ""}
      <form method="GET" action="/tv">
        <input name="code" autocomplete="off" autofocus inputmode="text" maxlength="8" placeholder="CODE" />
        <div class="button-grid">
          <button name="mode" value="webrtc" type="submit">Connect</button>
          <button class="secondary" name="mode" value="fallback" type="submit">Compatibility</button>
        </div>
      </form>
      <div class="hint">Find the code in the StoryDesk app on your Mac.</div>
    </main>
    <script>
      const input = document.querySelector("input");
      input?.addEventListener("input", () => {
        input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
