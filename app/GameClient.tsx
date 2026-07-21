"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDefaultRenderer, createMansePlayer, type MansePlayer, type PlayerSnapshot, type ProviderKind, type RendererFactory } from "@manse/runtime-web";
import { GAME_CONFIG, type SupportedLocale, UI_COPY } from "./game-config";

const PACK_URL = `/packs/${GAME_CONFIG.slug}/manse.pack.json`;
const THEMED_RENDERER: RendererFactory = (options) => {
  const renderer = createDefaultRenderer(options);
  Object.assign(renderer.element.style, {
    backgroundImage: "linear-gradient(rgba(2,12,35,.04), rgba(2,10,29,.38)), url('/packs/museum-statues/assets/images/night-museum-hero.png')",
    backgroundPosition: "center",
    backgroundSize: "cover",
  });
  const cameraSurface = renderer.element.firstElementChild as HTMLElement | null;
  if (cameraSurface?.tagName === "CANVAS") cameraSurface.style.opacity = "0.38";
  return renderer;
};
const EMPTY: Pick<PlayerSnapshot, "phase" | "provider" | "tier" | "renderer" | "cameraActive" | "targetProgress" | "caption"> = {
  phase: "idle",
  provider: "simulated",
  tier: "A",
  renderer: null,
  cameraActive: false,
  targetProgress: null,
  caption: null,
};

function browserLocale(): SupportedLocale {
  const preferences = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const preference of preferences) {
    const language = preference.toLowerCase();
    if (language.startsWith("ko")) return "ko";
    if (language.startsWith("en")) return "en";
  }
  return GAME_CONFIG.locale;
}

export function GameClient() {
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<MansePlayer | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const [locale, setLocale] = useState<SupportedLocale>(GAME_CONFIG.locale);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = UI_COPY[locale];

  const boot = useCallback(async (provider: ProviderKind) => {
    const container = stageRef.current;
    if (container === null) return;
    const runId = ++runIdRef.current;
    const localized = UI_COPY[locale];
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    await playerRef.current?.destroy();
    if (runId !== runIdRef.current) return;

    const player = createMansePlayer({
      container,
      provider,
      rendererFactory: THEMED_RENDERER,
      locale,
      captions: true,
      reducedStimulation: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onEvent: (event) => {
        if (runId !== runIdRef.current) return;
        if (event.type === "error") setError(localized.errorGeneric);
      },
    });
    playerRef.current = player;
    unsubscribeRef.current = player.subscribe((next) => {
      if (runId === runIdRef.current) setSnapshot(next);
    });
    try {
      await player.load(PACK_URL);
      await player.setup();
      await player.play();
    } catch {
      if (runId === runIdRef.current) setError(localized.errorGeneric);
    } finally {
      if (runId === runIdRef.current) setBusy(false);
    }
  }, [locale]);

  useEffect(() => {
    setLocale(browserLocale());
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      runIdRef.current += 1;
      unsubscribeRef.current?.();
      void playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const start = (provider: ProviderKind) => {
    setBusy(true);
    setError(null);
    void boot(provider);
  };

  const switchLocale = (nextLocale: SupportedLocale) => {
    if (nextLocale === locale) return;
    const runId = ++runIdRef.current;
    const player = playerRef.current;
    playerRef.current = null;
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setBusy(true);
    void (player?.destroy() ?? Promise.resolve()).finally(() => {
      if (runId !== runIdRef.current) return;
      setSnapshot(EMPTY);
      setError(null);
      setLocale(nextLocale);
      setBusy(false);
    });
  };

  const movePointer = (clientX: number, clientY: number) => {
    if (busy || snapshot.provider !== "simulated") return;
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds === undefined || bounds.width === 0 || bounds.height === 0) return;
    try {
      playerRef.current?.setPointer((clientX - bounds.left) / bounds.width, (clientY - bounds.top) / bounds.height);
    } catch {
      // A final pointer event can overlap a provider or locale change.
    }
  };

  const progress = snapshot.targetProgress;
  const status = error !== null
    ? copy.statusAttention
    : busy
      ? copy.statusStarting
      : snapshot.phase === "complete"
        ? copy.statusComplete
        : snapshot.phase === "idle"
          ? copy.statusIdle
          : snapshot.cameraActive
            ? copy.statusCamera
            : copy.statusSimulator;

  return (
    <main>
      <nav className="utility-nav" aria-label={copy.languageLabel}>
        <a className="manse-mark" href="#player">MANSE / 04</a>
        <div className="locale-switcher" role="group" aria-label={copy.languageLabel}>
          {(["ko", "en"] as const).map((option) => (
            <button
              type="button"
              key={option}
              className={locale === option ? "locale-button active" : "locale-button"}
              aria-pressed={locale === option}
              onClick={() => switchLocale(option)}
              disabled={busy}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>

      <header className="game-hero">
        <div className="hero-copy">
          <p className="kicker">{copy.kicker}</p>
          <h1>{copy.title}</h1>
          <p className="summary">{copy.summary}</p>
          <div className="privacy-line"><span aria-hidden="true" /> {copy.privacy}</div>
        </div>
        <figure className="hero-art">
          <img src={GAME_CONFIG.heroPath} alt={copy.heroAlt} />
          <span className="hero-number" aria-hidden="true">04</span>
          <figcaption aria-hidden="true">{copy.galleryLabel}</figcaption>
        </figure>
      </header>

      <section id="player" className="player-shell" aria-label={copy.playerLabel}>
        <div className="player-bar">
          <span><i className={error === null ? "status-dot" : "status-dot status-error"} aria-hidden="true" /> {status}</span>
          <span>{snapshot.renderer ?? copy.runtimeReady} · {copy.tier} {snapshot.tier}</span>
        </div>
        <div
          className="stage"
          key={locale}
          ref={stageRef}
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest("button, a")) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            movePointer(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => movePointer(event.clientX, event.clientY)}
          aria-label={copy.stageLabel}
        >
          {snapshot.phase === "idle" && (
            <div className="start-card">
              <p>{copy.startGuide}</p>
              <div className="actions">
                <button type="button" onClick={() => start("simulated")} disabled={busy}>{copy.playPointer}</button>
                <button className="secondary" type="button" onClick={() => start("mediapipe")} disabled={busy}>{copy.useCamera}</button>
              </div>
            </div>
          )}
        </div>
        <div className="player-footer" aria-live="polite">
          <span>{error ?? snapshot.caption ?? copy.comfortableSpace}</span>
          <strong>{progress === null ? "—" : `${progress.completed} / ${progress.total}`}</strong>
        </div>
        {snapshot.phase !== "idle" && (
          <div className="restart-row">
            <button type="button" onClick={() => start("simulated")} disabled={busy}>{copy.restartPointer}</button>
            <button className="text-button" type="button" onClick={() => start("mediapipe")} disabled={busy}>{copy.switchCamera}</button>
          </div>
        )}
      </section>

      <footer>
        <p>{copy.footer}</p>
        <a href={GAME_CONFIG.sourceUrl}>{copy.source} ↗</a>
      </footer>
    </main>
  );
}
