import {
  Bot,
  Cast,
  CheckCircle2,
  Copy,
  Monitor,
  MonitorUp,
  PauseCircle,
  Play,
  Power,
  RefreshCw,
  Square,
  Wifi,
  XCircle
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, AgentSettings, AgentToolCall } from "./types";
import { useStoryDeskRuntime } from "./runtime/useStoryDeskRuntime";

function App() {
  const {
    runtimeState,
    settings,
    agentSettings,
    agentSnapshot,
    agentEvents,
    logs,
    videoRef,
    desktopAvailable,
    actions
  } = useStoryDeskRuntime();

  const selectedSourceId = runtimeState.stream.sourceId ?? "";
  const selectedDeviceId = runtimeState.cast.selectedDeviceId ?? "";
  const displayReady = runtimeState.display.status === "ready";
  const streamLive = runtimeState.stream.status === "live";
  const streamStarting = runtimeState.stream.status === "starting";
  const castConnected = runtimeState.cast.status === "connected";

  const selectedSource = useMemo(
    () => runtimeState.sources.find((source) => source.id === selectedSourceId),
    [runtimeState.sources, selectedSourceId]
  );
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus();
  }, []);

  return (
    <main className="app-shell" ref={mainRef} tabIndex={-1} aria-label="StoryDesk">
      <section className="topbar">
        <div>
          <h1>StoryDesk</h1>
          <p>{runtimeState.session?.receiverUrl ?? "Starting local server"}</p>
        </div>
        <div className="status-strip">
          <StatusPill label="Desktop" active={desktopAvailable} />
          <StatusPill label="Display" active={displayReady} />
          <StatusPill label="Stream" active={streamLive} />
          <StatusPill label="Receiver" active={runtimeState.receiver.status === "connected"} />
          <StatusPill label="Cast" active={castConnected} />
        </div>
      </section>

      {!desktopAvailable && (
        <section className="notice-band" role="status">
          Browser preview mode. Use the Electron StoryDesk window for virtual display, streaming, Cast, and Autopilot controls.
        </section>
      )}

      <section className="workspace">
        <div className="preview-panel">
          <div className="preview-toolbar">
            <div className="source-select">
              <Monitor size={16} aria-hidden="true" />
              <select
                aria-label="Capture source"
                value={selectedSourceId}
                onChange={(event) => actions.setSelectedSourceId(event.target.value)}
              >
                <option value="">No source</option>
                {runtimeState.sources.map((source) => (
                  <option value={source.id} key={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="icon-button"
              title="Refresh sources"
              aria-label="Refresh sources"
              onClick={() => void actions.refreshSources()}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="video-frame">
            <video ref={videoRef} autoPlay muted playsInline aria-label="Virtual display preview" />
            {!streamLive && (
              <div className="empty-state">
                <MonitorUp size={36} />
                <span>{displayReady ? selectedSource?.name ?? "Ready" : "Display offline"}</span>
              </div>
            )}
          </div>
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-title">
              <MonitorUp size={18} />
              <h2>Virtual Display</h2>
            </div>
            <div className="resolution-grid">
              {[
                [1280, 720],
                [1600, 900],
                [1920, 1080],
                [2560, 1440]
              ].map(([width, height]) => (
                <button
                  type="button"
                  key={`${width}x${height}`}
                  aria-label={`Virtual display ${width} by ${height}`}
                  aria-pressed={
                    settings.display.width === width &&
                    settings.display.height === height
                  }
                  className={
                    settings.display.width === width &&
                    settings.display.height === height
                      ? "choice active"
                      : "choice"
                  }
                  onClick={() => actions.updateDisplay({ width, height })}
                  disabled={!desktopAvailable}
                >
                  {width}x{height}
                </button>
              ))}
            </div>
            <label className="toggle-row">
              <span>HiDPI</span>
              <input
                type="checkbox"
                checked={settings.display.hidpi}
                onChange={(event) => actions.updateDisplay({ hidpi: event.target.checked })}
                disabled={!desktopAvailable}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                aria-label="Start virtual display"
                onClick={() => void actions.startDisplay()}
                disabled={!desktopAvailable || runtimeState.display.status === "starting" || displayReady}
              >
                <Power size={17} aria-hidden="true" />
                Start
              </button>
              <button
                type="button"
                className="secondary"
                aria-label="Stop virtual display"
                onClick={() => void actions.stopDisplay()}
                disabled={!desktopAvailable || !displayReady}
              >
                <Square size={17} aria-hidden="true" />
                Stop
              </button>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Wifi size={18} />
              <h2>Stream</h2>
            </div>
            <label>
              FPS
              <input
                type="number"
                min={15}
                max={60}
                value={settings.stream.fps}
                onChange={(event) => actions.updateStream({ fps: Number(event.target.value) })}
                disabled={!desktopAvailable}
              />
            </label>
            <label>
              Bitrate
              <input
                type="number"
                min={1500}
                max={25000}
                step={500}
                value={settings.stream.bitrateKbps}
                onChange={(event) =>
                  actions.updateStream({ bitrateKbps: Number(event.target.value) })
                }
                disabled={!desktopAvailable}
              />
            </label>
            <div className="metrics-row">
              <span>{runtimeState.receiver.connectedCount} receiver</span>
              <span>{runtimeState.receiver.latencyMs ?? "-"} ms</span>
              <span>{runtimeState.receiver.frameRate ?? settings.stream.fps} fps</span>
            </div>
            <div className="button-row">
              <button
                type="button"
                aria-label="Start stream"
                onClick={() => void actions.startStream()}
                disabled={!desktopAvailable || !displayReady || streamLive || streamStarting}
              >
                <Play size={17} aria-hidden="true" />
                Start
              </button>
              <button
                type="button"
                className="secondary"
                aria-label="Stop stream"
                onClick={() => void actions.stopStream()}
                disabled={!desktopAvailable || (!streamLive && !streamStarting)}
              >
                <Square size={17} aria-hidden="true" />
                Stop
              </button>
            </div>
          </section>

          <section className="panel-section receiver-section">
            <div className="section-title">
              <CheckCircle2 size={18} />
              <h2>Receiver</h2>
            </div>
            {runtimeState.session && (
              <>
                <QRCodeSVG value={runtimeState.session.receiverUrl} size={126} title="Receiver URL QR code" />
                <div className="button-row full-row">
                  <button
                    type="button"
                    className="secondary"
                    aria-label="Copy receiver URL"
                    onClick={() => void actions.copyReceiverUrl()}
                  >
                    <Copy size={17} aria-hidden="true" />
                    Copy
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label="Open receiver URL"
                    onClick={() => void actions.openReceiverUrl()}
                  >
                    <Monitor size={17} aria-hidden="true" />
                    Open
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="panel-section tv-section">
            <div className="section-title">
              <Monitor size={18} />
              <h2>TV / Fire Stick</h2>
            </div>
            {runtimeState.session && (
              <>
                <div className="tv-code" aria-label="TV join code">
                  {runtimeState.session.joinCode}
                </div>
                <div className="tv-url">{runtimeState.session.tvUrl}</div>
                <div className="button-row full-row">
                  <button
                    type="button"
                    className="secondary"
                    aria-label="Copy TV join details"
                    onClick={() => void actions.copyTvUrl()}
                  >
                    <Copy size={17} aria-hidden="true" />
                    Copy
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label="Open TV join page"
                    onClick={() => void actions.openTvUrl()}
                  >
                    <Monitor size={17} aria-hidden="true" />
                    Open
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label="Open compatibility receiver"
                    onClick={() => void actions.openFallbackUrl()}
                  >
                    <Wifi size={17} aria-hidden="true" />
                    Compat
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Cast size={18} />
              <h2>Chromecast</h2>
            </div>
            <div className="source-select">
              <Cast size={16} aria-hidden="true" />
              <select
                aria-label="Chromecast device"
                value={selectedDeviceId}
                onChange={(event) => actions.setSelectedDeviceId(event.target.value)}
              >
                <option value="">No device</option>
                {runtimeState.cast.devices.map((device) => (
                  <option value={device.id} key={device.id}>
                    {device.name} {device.model ? `(${device.model})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                aria-label="Scan Chromecast devices"
                onClick={() => void actions.discoverCastDevices()}
                disabled={!desktopAvailable}
              >
                <RefreshCw size={17} aria-hidden="true" />
                Scan
              </button>
              <button
                type="button"
                aria-label="Start Chromecast"
                onClick={() => void actions.connectCast()}
                disabled={!desktopAvailable || !streamLive || !selectedDeviceId || castConnected}
              >
                <Cast size={17} aria-hidden="true" />
                Cast
              </button>
              <button
                type="button"
                className="secondary"
                aria-label="End Chromecast"
                onClick={() => void actions.disconnectCast()}
                disabled={!desktopAvailable || !castConnected}
              >
                <XCircle size={17} aria-hidden="true" />
                End
              </button>
            </div>
          </section>
        </aside>
      </section>

      <AutopilotPanel
        agentSettings={agentSettings}
        snapshot={agentSnapshot}
        events={agentEvents}
        pendingTool={agentSnapshot.pendingToolCall}
        onSettingsChange={actions.persistAgentSettings}
        onStart={actions.startAgentGoal}
        onApprove={actions.approveAgentTool}
        onStop={actions.stopAgent}
        desktopAvailable={desktopAvailable}
      />

      <section className="log-rail">
        {logs.map((log) => (
          <span className={`log-item ${log.level}`} key={log.id}>
            {log.message}
          </span>
        ))}
      </section>
    </main>
  );
}

function AutopilotPanel({
  agentSettings,
  snapshot,
  events,
  pendingTool,
  onSettingsChange,
  onStart,
  onApprove,
  onStop,
  desktopAvailable
}: {
  agentSettings: AgentSettings;
  snapshot: { status: string; transcript: Array<{ role: string; content: string }>; pendingToolCall?: AgentToolCall };
  events: AgentEvent[];
  pendingTool?: AgentToolCall;
  onSettingsChange(settings: AgentSettings): Promise<void>;
  onStart(prompt: string): Promise<void>;
  onApprove(): Promise<void>;
  onStop(): Promise<void>;
  desktopAvailable: boolean;
}) {
  const [prompt, setPrompt] = useState("prepare a browser receiver session");

  return (
    <section className="autopilot-panel">
      <div className="section-title">
        <Bot size={18} />
        <h2>Autopilot</h2>
      </div>
      <input
        className="goal-input"
        aria-label="Autopilot goal"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <select
        aria-label="Autopilot provider"
        value={agentSettings.provider}
        onChange={(event) =>
          void onSettingsChange({
            ...agentSettings,
            provider: event.target.value as AgentSettings["provider"]
          })
        }
      >
        <option value="local">Local deterministic</option>
        <option value="openai-compatible">OpenAI-compatible</option>
      </select>
      <select
        aria-label="Approval mode"
        value={agentSettings.approvalMode}
        onChange={(event) =>
          void onSettingsChange({
            ...agentSettings,
            approvalMode: event.target.value as AgentSettings["approvalMode"]
          })
        }
      >
        <option value="manual">Manual approval</option>
        <option value="trusted">Trusted mode</option>
      </select>
      <div className="button-row">
        <button
          type="button"
          aria-label="Run Autopilot"
          onClick={() => void onStart(prompt)}
          disabled={!desktopAvailable || snapshot.status === "running"}
        >
          <Play size={17} aria-hidden="true" />
          Run
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Stop Autopilot"
          onClick={() => void onStop()}
          disabled={snapshot.status === "idle"}
        >
          <PauseCircle size={17} aria-hidden="true" />
          Stop
        </button>
        <button
          type="button"
          className="secondary"
          aria-label="Approve Autopilot tool"
          onClick={() => void onApprove()}
          disabled={!pendingTool}
        >
          <CheckCircle2 size={17} aria-hidden="true" />
          Approve
        </button>
      </div>
      {pendingTool && (
        <div className="approval-card">
          <strong>{pendingTool.tool}</strong>
          <span>{pendingTool.reason ?? "Approval required"}</span>
        </div>
      )}
      <div className="transcript-list">
        {events.slice(0, 6).map((event, index) => (
          <span key={`${event.type}-${index}`}>{formatAgentEvent(event)}</span>
        ))}
      </div>
    </section>
  );
}

function formatAgentEvent(event: AgentEvent) {
  if (event.type === "message") {
    return event.message;
  }
  if (event.type === "approval-required") {
    return `Approval needed: ${event.toolCall.tool}`;
  }
  if (event.type === "tool-result") {
    return `${event.result.id}: ${event.result.ok ? "ok" : event.result.error}`;
  }
  if (event.type === "state") {
    return `State: ${event.state}`;
  }
  if (event.type === "complete") {
    return event.summary;
  }
  if (event.type === "error") {
    return event.message;
  }
  if (event.type === "tool-proposed") {
    return `Proposed: ${event.toolCall.tool}`;
  }
  return event.type;
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={active ? "status-pill active" : "status-pill"}
      role="status"
      aria-label={`${label} ${active ? "on" : "off"}`}
    >
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export default App;
