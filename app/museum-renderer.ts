import {
  type ChallengeGuide,
  type RendererFactory,
  type RendererFactoryOptions,
  type RuntimeLandmark,
  type RuntimeRenderFrame,
  type RuntimeRenderer,
} from "@manse/runtime-web";
import { MUSEUM_FEEL, UI_COPY, type SupportedLocale } from "./game-config";

type Reaction = "ready" | "freeze" | "holding" | "dance" | "reset" | "round-clear" | "complete";
type RendererCopy = (typeof UI_COPY)[SupportedLocale]["renderer"];

interface Size {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

interface Sparkle {
  readonly x: number;
  readonly y: number;
  readonly seed: number;
  readonly bornAtMs: number;
}

export function createMuseumRendererFactory(locale: SupportedLocale): RendererFactory {
  return (options) => new MuseumRenderer(options, UI_COPY[locale].renderer);
}

class MuseumRenderer implements RuntimeRenderer {
  readonly kind = "canvas2d" as const;
  readonly element: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly sparkles: Sparkle[] = [];
  private previousPhase: ChallengeGuide["phase"] | null = null;
  private previousUnits = 0;
  private totalStars = 0;
  private resetAtMs = -Infinity;
  private unitAtMs = -Infinity;
  private destroyed = false;

  constructor(
    private readonly options: RendererFactoryOptions,
    private readonly copy: RendererCopy,
  ) {
    const document = options.document;
    this.element = document.createElement("div");
    this.element.dataset.manseRenderer = "museum-statues";
    this.element.setAttribute("role", "img");
    this.element.setAttribute("aria-label", "Museum Statues augmented-reality play field");
    Object.assign(this.element.style, {
      position: "relative",
      width: "100%",
      height: "100%",
      minHeight: "320px",
      overflow: "hidden",
      background: MUSEUM_FEEL.palette.night,
      touchAction: "none",
      isolation: "isolate",
    });

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-hidden", "true");
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    const context = this.canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.element.append(this.canvas);
    options.container.append(this.element);
  }

  render(frame: RuntimeRenderFrame): void {
    if (this.destroyed) return;
    const size = resize(this.element, this.canvas, frame.tier);
    const { context } = this;
    context.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    drawStageBase(context, size, frame);

    const guide = frame.challenge?.kind === "freeze" ? frame.challenge : null;
    this.captureReactions(guide, frame.timestampMs, size);
    const reaction = this.reaction(frame, guide);
    drawLivingStatue(context, size, frame, reaction);
    drawMuseumFrame(context, size);
    drawFlashlight(context, size, frame, guide, reaction);
    drawPedestals(context, size, reaction === "complete" ? MUSEUM_FEEL.totalRounds : this.totalStars);
    drawGuard(context, size, frame.timestampMs, reaction, frame.reducedStimulation);
    this.drawSparkles(frame.timestampMs, size, frame.reducedStimulation);
    drawMissionHud(context, size, guide, reaction, this.copy, frame.timestampMs, this.unitAtMs, this.totalStars);
    if (reaction === "complete") {
      drawFinale(context, size, frame, this.copy);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.sparkles.length = 0;
    this.element.remove();
  }

  private captureReactions(guide: ChallengeGuide | null, nowMs: number, size: Size): void {
    if (guide === null) return;
    if (guide.completedUnits < this.previousUnits || (this.previousPhase === "done" && guide.phase !== "done")) {
      this.previousUnits = 0;
    }
    if (this.previousPhase === "holding" && guide.phase === "active" && guide.completedUnits === this.previousUnits) {
      this.resetAtMs = nowMs;
    }
    if (guide.completedUnits > this.previousUnits) {
      const earned = guide.completedUnits - this.previousUnits;
      this.totalStars = Math.min(MUSEUM_FEEL.totalRounds, this.totalStars + earned);
      this.unitAtMs = nowMs;
      const count = this.options.reducedStimulation ? 7 : 18;
      for (let index = 0; index < count; index += 1) {
        this.sparkles.push({
          x: size.width * (0.18 + (this.totalStars - 1) * 0.16),
          y: size.height * 0.86,
          seed: hash(`${guide.completedUnits}:${index}`),
          bornAtMs: nowMs,
        });
      }
    }
    this.previousPhase = guide.phase;
    this.previousUnits = guide.completedUnits;
  }

  private reaction(frame: RuntimeRenderFrame, guide: ChallengeGuide | null): Reaction {
    if (guide === null && frame.celebrationProgress > 0) return "complete";
    if (guide?.phase === "done") return "round-clear";
    if (frame.timestampMs - this.resetAtMs < MUSEUM_FEEL.reactionFlashMs) return "reset";
    if (guide === null) return "ready";
    if (guide.phase === "cooldown") return "dance";
    if (guide.phase === "holding") return "holding";
    return "freeze";
  }

  private drawSparkles(nowMs: number, size: Size, reduced: boolean): void {
    const { context } = this;
    for (let index = this.sparkles.length - 1; index >= 0; index -= 1) {
      const sparkle = this.sparkles[index];
      if (sparkle === undefined) continue;
      const age = nowMs - sparkle.bornAtMs;
      const progress = age / MUSEUM_FEEL.roundCelebrationMs;
      if (progress >= 1) {
        this.sparkles.splice(index, 1);
        continue;
      }
      const angle = seeded(sparkle.seed) * Math.PI * 2;
      const distance = (reduced ? 28 : 80) * progress;
      const x = sparkle.x + Math.cos(angle) * distance;
      const y = sparkle.y + Math.sin(angle) * distance - progress * 26;
      const radius = 3 + seeded(sparkle.seed + 7) * 5;
      context.save();
      context.translate(x, y);
      context.rotate(angle + progress * 2);
      context.globalAlpha = Math.max(0, 1 - progress);
      context.fillStyle = index % 3 === 0 ? MUSEUM_FEEL.palette.marble : MUSEUM_FEEL.palette.gold;
      drawStar(context, 0, 0, radius, radius * 0.42, 4);
      context.fill();
      context.restore();
    }
    void size;
  }
}

function resize(element: HTMLElement, canvas: HTMLCanvasElement, tier: RuntimeRenderFrame["tier"]): Size {
  const width = Math.max(1, element.clientWidth || 960);
  const height = Math.max(1, element.clientHeight || 620);
  const deviceRatio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const tierLimit = tier === "S" || tier === "A" ? 2 : tier === "B" ? 1.5 : 1;
  const dpr = Math.min(deviceRatio, tierLimit);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  return { width, height, dpr };
}

function drawStageBase(context: CanvasRenderingContext2D, size: Size, frame: RuntimeRenderFrame): void {
  if (frame.video !== null && frame.video.readyState >= 2) {
    drawVideoCover(context, frame.video, size, frame.mirror);
    drawCameraGrade(context, size);
  } else {
    drawPaintedGallery(context, size, frame.timestampMs, frame.reducedStimulation);
  }
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  size: Size,
  mirror: boolean,
): void {
  const sourceWidth = Math.max(1, video.videoWidth || 1280);
  const sourceHeight = Math.max(1, video.videoHeight || 720);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = size.width / size.height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  context.save();
  if (mirror) {
    context.translate(size.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, sx, sy, sw, sh, 0, 0, size.width, size.height);
  context.restore();
}

function drawCameraGrade(context: CanvasRenderingContext2D, size: Size): void {
  context.fillStyle = "rgba(20,22,58,.09)";
  context.fillRect(0, 0, size.width, size.height);
  const vignette = context.createRadialGradient(
    size.width * 0.5,
    size.height * 0.44,
    size.width * 0.08,
    size.width * 0.5,
    size.height * 0.48,
    size.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(5,7,24,0)");
  vignette.addColorStop(0.76, "rgba(5,7,24,.08)");
  vignette.addColorStop(1, "rgba(5,7,24,.48)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size.width, size.height);
}

function drawPaintedGallery(
  context: CanvasRenderingContext2D,
  size: Size,
  nowMs: number,
  reduced: boolean,
): void {
  const wall = context.createLinearGradient(0, 0, 0, size.height);
  wall.addColorStop(0, "#111b4c");
  wall.addColorStop(0.62, "#171a42");
  wall.addColorStop(1, "#080b25");
  context.fillStyle = wall;
  context.fillRect(0, 0, size.width, size.height);

  const moonX = size.width * 0.18;
  const moonY = size.height * 0.17;
  const moonGlow = context.createRadialGradient(moonX, moonY, 0, moonX, moonY, size.width * 0.2);
  moonGlow.addColorStop(0, "rgba(182,209,255,.34)");
  moonGlow.addColorStop(1, "rgba(182,209,255,0)");
  context.fillStyle = moonGlow;
  context.fillRect(0, 0, size.width * 0.42, size.height * 0.42);

  // Tall moonlit windows make the simulator feel like a real exhibition room.
  for (const centerX of [size.width * 0.16, size.width * 0.84]) {
    const windowWidth = size.width * 0.14;
    const windowHeight = size.height * 0.43;
    const x = centerX - windowWidth / 2;
    const y = size.height * 0.09;
    context.fillStyle = "rgba(30,49,101,.72)";
    context.strokeStyle = "rgba(224,199,132,.56)";
    context.lineWidth = Math.max(3, size.width * 0.004);
    roundedRect(context, x, y, windowWidth, windowHeight, windowWidth * 0.48);
    context.fill();
    context.stroke();
    context.strokeStyle = "rgba(220,230,255,.18)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX, y + 8);
    context.lineTo(centerX, y + windowHeight - 8);
    context.moveTo(x + 7, y + windowHeight * 0.48);
    context.lineTo(x + windowWidth - 7, y + windowHeight * 0.48);
    context.stroke();
  }

  // Framed silhouettes are authored scenery, not runtime debug geometry.
  for (const centerX of [size.width * 0.34, size.width * 0.66]) {
    const width = size.width * 0.13;
    const height = size.height * 0.23;
    const y = size.height * 0.14;
    context.fillStyle = "rgba(8,11,34,.72)";
    context.strokeStyle = "rgba(239,200,109,.62)";
    context.lineWidth = Math.max(3, size.width * 0.004);
    context.fillRect(centerX - width / 2, y, width, height);
    context.strokeRect(centerX - width / 2, y, width, height);
    context.fillStyle = "rgba(235,226,207,.35)";
    context.beginPath();
    context.arc(centerX, y + height * 0.36, width * 0.12, 0, Math.PI * 2);
    context.fill();
    roundedRect(context, centerX - width * 0.2, y + height * 0.48, width * 0.4, height * 0.38, width * 0.12);
    context.fill();
  }

  const floorY = size.height * 0.69;
  const floor = context.createLinearGradient(0, floorY, 0, size.height);
  floor.addColorStop(0, "#22234b");
  floor.addColorStop(1, "#090b24");
  context.fillStyle = floor;
  context.fillRect(0, floorY, size.width, size.height - floorY);
  context.strokeStyle = "rgba(239,232,217,.13)";
  context.lineWidth = 1;
  for (let row = 1; row <= 4; row += 1) {
    const progress = row / 4;
    const y = floorY + (size.height - floorY) * progress * progress;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size.width, y);
    context.stroke();
  }
  for (let index = -5; index <= 5; index += 1) {
    context.beginPath();
    context.moveTo(size.width * 0.5, floorY);
    context.lineTo(size.width * (0.5 + index * 0.14), size.height);
    context.stroke();
  }

  const lampPulse = reduced ? 0 : Math.sin(nowMs / 520) * 0.06;
  for (const x of [size.width * 0.08, size.width * 0.92]) {
    context.fillStyle = `rgba(255,214,126,${0.58 + lampPulse})`;
    context.beginPath();
    context.arc(x, size.height * 0.48, 8, 0, Math.PI * 2);
    context.fill();
  }
}

const STATUE_CONNECTIONS: readonly (readonly [number, number])[] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [24, 26], [26, 28],
];

function drawLivingStatue(
  context: CanvasRenderingContext2D,
  size: Size,
  frame: RuntimeRenderFrame,
  reaction: Reaction,
): void {
  const landmarks = frame.poseFrame?.poses[0]?.landmarks ?? [];
  if (landmarks.length === 0) return;
  const cameraMode = frame.video !== null;
  const minimum = Math.min(size.width, size.height);
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = cameraMode ? 0.58 : 0.96;
  context.strokeStyle = reaction === "reset" ? "#ffab97" : cameraMode ? "rgba(246,237,220,.92)" : "#e9e2d6";
  context.shadowColor = "rgba(7,9,31,.68)";
  context.shadowBlur = cameraMode ? 7 : 14;
  context.lineWidth = Math.max(7, minimum * (cameraMode ? 0.014 : 0.024));
  for (const [from, to] of STATUE_CONNECTIONS) {
    const start = landmarks[from];
    const end = landmarks[to];
    if (!visibleLandmark(start) || !visibleLandmark(end)) continue;
    context.beginPath();
    context.moveTo(start.x * size.width, start.y * size.height);
    context.lineTo(end.x * size.width, end.y * size.height);
    context.stroke();
  }
  context.shadowBlur = 0;

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  if (visibleLandmark(leftShoulder) && visibleLandmark(rightShoulder) && visibleLandmark(leftHip) && visibleLandmark(rightHip)) {
    context.fillStyle = cameraMode ? "rgba(236,226,207,.18)" : "rgba(224,218,209,.82)";
    context.strokeStyle = cameraMode ? "rgba(255,244,219,.76)" : "#f4eee2";
    context.lineWidth = Math.max(3, minimum * 0.008);
    context.beginPath();
    context.moveTo(leftShoulder.x * size.width, leftShoulder.y * size.height);
    context.lineTo(rightShoulder.x * size.width, rightShoulder.y * size.height);
    context.lineTo(rightHip.x * size.width, rightHip.y * size.height);
    context.lineTo(leftHip.x * size.width, leftHip.y * size.height);
    context.closePath();
    context.fill();
    context.stroke();
  }

  const nose = landmarks[0];
  if (visibleLandmark(nose)) {
    const headX = nose.x * size.width;
    const headY = nose.y * size.height;
    const crownRadius = minimum * 0.046;
    context.fillStyle = cameraMode ? "rgba(239,232,219,.16)" : "#ded9d1";
    context.strokeStyle = cameraMode ? "rgba(255,244,219,.78)" : "#f6efe1";
    context.lineWidth = Math.max(3, minimum * 0.006);
    context.beginPath();
    context.ellipse(headX, headY, crownRadius * 0.76, crownRadius * 0.94, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (!cameraMode) {
      context.strokeStyle = "rgba(87,88,107,.58)";
      context.lineWidth = Math.max(2, minimum * 0.003);
      context.beginPath();
      context.moveTo(headX - crownRadius * 0.32, headY - crownRadius * 0.1);
      context.lineTo(headX - crownRadius * 0.12, headY - crownRadius * 0.12);
      context.moveTo(headX + crownRadius * 0.12, headY - crownRadius * 0.12);
      context.lineTo(headX + crownRadius * 0.32, headY - crownRadius * 0.1);
      context.stroke();
    }
    context.strokeStyle = MUSEUM_FEEL.palette.gold;
    context.lineWidth = Math.max(3, minimum * 0.007);
    context.beginPath();
    context.arc(headX, headY - crownRadius * 0.55, crownRadius, Math.PI * 1.1, Math.PI * 1.9);
    context.stroke();
    for (let index = -2; index <= 2; index += 1) {
      const angle = -Math.PI / 2 + index * 0.26;
      const x = headX + Math.cos(angle) * crownRadius;
      const y = headY - crownRadius * 0.55 + Math.sin(angle) * crownRadius;
      context.fillStyle = index % 2 === 0 ? MUSEUM_FEEL.palette.gold : MUSEUM_FEEL.palette.marble;
      context.beginPath();
      context.ellipse(x, y, 3, 7, angle, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function visibleLandmark(landmark: RuntimeLandmark | undefined): landmark is RuntimeLandmark {
  return landmark !== undefined && Math.min(landmark.visibility, landmark.presence) >= 0.35;
}

function drawMuseumFrame(context: CanvasRenderingContext2D, size: Size): void {
  const sideWidth = Math.max(34, size.width * 0.055);
  const vignette = context.createRadialGradient(size.width * 0.5, size.height * 0.46, size.width * 0.18, size.width * 0.5, size.height * 0.48, size.width * 0.68);
  vignette.addColorStop(0, "rgba(4,7,24,0)");
  vignette.addColorStop(0.7, "rgba(4,7,24,.08)");
  vignette.addColorStop(1, "rgba(4,7,24,.72)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size.width, size.height);

  context.fillStyle = "rgba(7,9,29,.82)";
  context.fillRect(0, 0, sideWidth, size.height);
  context.fillRect(size.width - sideWidth, 0, sideWidth, size.height);
  context.strokeStyle = "rgba(239,200,109,.42)";
  context.lineWidth = 2;
  for (const x of [sideWidth * 0.62, size.width - sideWidth * 0.62]) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, size.height);
    context.stroke();
  }

  const floorY = size.height * 0.83;
  const floor = context.createLinearGradient(0, floorY, 0, size.height);
  floor.addColorStop(0, "rgba(13,17,47,.12)");
  floor.addColorStop(1, "rgba(5,7,23,.76)");
  context.fillStyle = floor;
  context.fillRect(0, floorY, size.width, size.height - floorY);
  context.strokeStyle = "rgba(232,223,207,.16)";
  context.lineWidth = 1;
  for (let index = -3; index <= 3; index += 1) {
    context.beginPath();
    context.moveTo(size.width * 0.5, floorY);
    context.lineTo(size.width * (0.5 + index * 0.19), size.height);
    context.stroke();
  }
}

function drawFlashlight(
  context: CanvasRenderingContext2D,
  size: Size,
  frame: RuntimeRenderFrame,
  guide: ChallengeGuide | null,
  reaction: Reaction,
): void {
  const lightOn = reaction === "freeze" || reaction === "holding" || reaction === "reset";
  if (!lightOn) {
    context.fillStyle = "rgba(5,7,24,.12)";
    context.fillRect(0, 0, size.width, size.height);
    return;
  }
  const poseCenter = centerOfPose(frame.poseFrame?.poses[0]?.landmarks ?? []);
  const sweep = frame.reducedStimulation ? 0 : Math.sin(frame.timestampMs / MUSEUM_FEEL.beamSweepMs * Math.PI * 2) * size.width * 0.13;
  const targetX = (poseCenter?.x ?? 0.5) * size.width + (reaction === "freeze" ? sweep : 0);
  const targetY = (poseCenter?.y ?? 0.55) * size.height;
  const originX = size.width * 0.94;
  const originY = size.height * 0.11;
  const spread = Math.max(size.width, size.height) * (reaction === "holding" ? 0.34 : 0.28);

  context.save();
  context.globalCompositeOperation = "screen";
  const beam = context.createRadialGradient(targetX, targetY, 0, targetX, targetY, spread);
  beam.addColorStop(0, reaction === "reset" ? "rgba(255,145,112,.30)" : "rgba(255,229,159,.30)");
  beam.addColorStop(0.55, "rgba(255,214,123,.13)");
  beam.addColorStop(1, "rgba(255,210,105,0)");
  context.fillStyle = beam;
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(targetX - spread * 0.6, targetY + spread * 0.6);
  context.arc(targetX, targetY, spread * 0.62, Math.PI * 0.72, Math.PI * 1.55);
  context.closePath();
  context.fill();
  context.strokeStyle = reaction === "holding" ? "rgba(255,231,169,.46)" : "rgba(255,214,123,.26)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();

  if (guide?.phase === "holding") {
    const hold = Math.max(0, Math.min(1, guide.holdProgress));
    const radius = Math.min(size.width, size.height) * 0.115;
    context.strokeStyle = "rgba(255,255,255,.18)";
    context.lineWidth = Math.max(8, radius * 0.12);
    context.beginPath();
    context.arc(targetX, targetY, radius, -Math.PI / 2, Math.PI * 1.5);
    context.stroke();
    context.strokeStyle = MUSEUM_FEEL.palette.amber;
    context.beginPath();
    context.arc(targetX, targetY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hold);
    context.stroke();
  }
}

function drawPedestals(context: CanvasRenderingContext2D, size: Size, completed: number): void {
  const width = Math.min(68, size.width * 0.075);
  const gap = size.width * 0.16;
  const startX = size.width * 0.18;
  const y = size.height * 0.91;
  for (let index = 0; index < 5; index += 1) {
    const x = startX + index * gap;
    const earned = index < completed;
    context.fillStyle = earned ? "rgba(239,200,109,.94)" : "rgba(221,217,220,.20)";
    context.strokeStyle = earned ? "rgba(255,235,181,.9)" : "rgba(232,223,207,.33)";
    context.lineWidth = 2;
    roundedRect(context, x - width * 0.5, y, width, size.height * 0.06, 4);
    context.fill();
    context.stroke();
    context.save();
    context.translate(x, y - 8);
    context.fillStyle = earned ? MUSEUM_FEEL.palette.gold : "rgba(232,223,207,.24)";
    drawStar(context, 0, 0, earned ? 12 : 9, earned ? 5 : 4, 5);
    context.fill();
    context.restore();
  }
}

function drawGuard(context: CanvasRenderingContext2D, size: Size, nowMs: number, reaction: Reaction, reduced: boolean): void {
  const bob = reduced ? 0 : Math.sin(nowMs / 380) * 2;
  const x = size.width * 0.945;
  const y = size.height * 0.16 + bob;
  context.save();
  context.translate(x, y);
  context.fillStyle = reaction === "reset" ? MUSEUM_FEEL.palette.alert : MUSEUM_FEEL.palette.gold;
  context.shadowColor = context.fillStyle;
  context.shadowBlur = reduced ? 0 : 12;
  context.beginPath();
  context.arc(0, 0, 8, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255,255,255,.74)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, 15, -Math.PI * 0.75, Math.PI * 0.75);
  context.stroke();
  context.restore();
}

function drawMissionHud(
  context: CanvasRenderingContext2D,
  size: Size,
  guide: ChallengeGuide | null,
  reaction: Reaction,
  copy: RendererCopy,
  nowMs: number,
  unitAtMs: number,
  totalStars: number,
): void {
  if (reaction === "complete") return;
  const compact = size.width < 650;
  const panelWidth = Math.min(compact ? size.width * 0.88 : 480, size.width - 32);
  const x = (size.width - panelWidth) / 2;
  const y = compact ? 18 : 22;
  const title = reaction === "reset" ? copy.reset
    : reaction === "round-clear" ? copy.roundClear
    : reaction === "dance" ? copy.dance
      : reaction === "holding" ? copy.holding
        : copy.freeze;
  const hint = guide?.framing !== null && guide?.framing !== undefined ? copy.framing
    : reaction === "reset" ? copy.resetHint
      : reaction === "round-clear" ? copy.roundClearHint
      : reaction === "dance" ? copy.danceHint
        : reaction === "holding" ? copy.holdingHint
          : copy.freezeHint;
  const accent = reaction === "reset" ? MUSEUM_FEEL.palette.alert
    : reaction === "dance" || reaction === "round-clear" ? MUSEUM_FEEL.palette.success
      : MUSEUM_FEEL.palette.gold;

  context.fillStyle = "rgba(5,8,28,.78)";
  context.strokeStyle = `${accent}aa`;
  context.lineWidth = 2;
  roundedRect(context, x, y, panelWidth, compact ? 94 : 102, 18);
  context.fill();
  context.stroke();
  context.fillStyle = accent;
  context.font = `800 ${compact ? 23 : 29}px ${fontFamily()}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title, size.width / 2, y + 34);
  context.fillStyle = "rgba(246,241,231,.88)";
  context.font = `650 ${compact ? 12 : 14}px ${fontFamily()}`;
  context.fillText(hint, size.width / 2, y + 68, panelWidth - 34);

  const justEarned = nowMs - unitAtMs < MUSEUM_FEEL.roundCelebrationMs;
  context.textAlign = "left";
  context.font = `750 ${compact ? 10 : 11}px ${monoFamily()}`;
  context.fillStyle = "rgba(246,241,231,.66)";
  context.fillText(copy.wing, 18, size.height - 18);
  context.textAlign = "right";
  context.fillStyle = justEarned ? MUSEUM_FEEL.palette.amber : "rgba(246,241,231,.78)";
  context.fillText(`${copy.galleryStars}  ${totalStars} / ${MUSEUM_FEEL.totalRounds}`, size.width - 18, size.height - 18);
}

function drawFinale(context: CanvasRenderingContext2D, size: Size, frame: RuntimeRenderFrame, copy: RendererCopy): void {
  const progress = Math.max(frame.celebrationProgress, 0.35);
  context.fillStyle = `rgba(7,9,31,${0.5 + progress * 0.25})`;
  context.fillRect(0, 0, size.width, size.height);
  const glow = context.createRadialGradient(size.width / 2, size.height * 0.45, 0, size.width / 2, size.height * 0.45, size.width * 0.48);
  glow.addColorStop(0, "rgba(255,220,139,.42)");
  glow.addColorStop(1, "rgba(255,220,139,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size.width, size.height);

  const count = frame.reducedStimulation ? 10 : 34;
  for (let index = 0; index < count; index += 1) {
    const seed = hash(`finale:${index}`);
    const angle = seeded(seed) * Math.PI * 2;
    const distance = (0.1 + seeded(seed + 1) * 0.43) * Math.min(size.width, size.height) * progress;
    const x = size.width / 2 + Math.cos(angle) * distance;
    const y = size.height * 0.42 + Math.sin(angle) * distance;
    context.save();
    context.translate(x, y);
    context.rotate(angle + progress * 2);
    context.globalAlpha = Math.min(1, progress * 2) * (0.55 + seeded(seed + 2) * 0.45);
    context.fillStyle = index % 3 === 0 ? MUSEUM_FEEL.palette.marble : MUSEUM_FEEL.palette.gold;
    drawStar(context, 0, 0, 5 + seeded(seed + 3) * 9, 2 + seeded(seed + 4) * 4, index % 2 === 0 ? 4 : 5);
    context.fill();
    context.restore();
  }

  const panelWidth = Math.min(660, size.width - 34);
  const panelHeight = size.width < 650 ? 176 : 196;
  const x = (size.width - panelWidth) / 2;
  const y = size.height * 0.5 - panelHeight * 0.48;
  context.fillStyle = "rgba(8,11,36,.83)";
  context.strokeStyle = MUSEUM_FEEL.palette.gold;
  context.lineWidth = 3;
  roundedRect(context, x, y, panelWidth, panelHeight, 24);
  context.fill();
  context.stroke();
  context.fillStyle = MUSEUM_FEEL.palette.gold;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.min(44, Math.max(27, size.width * 0.055))}px ${fontFamily()}`;
  context.fillText(copy.complete, size.width / 2, y + panelHeight * 0.39, panelWidth - 36);
  context.fillStyle = MUSEUM_FEEL.palette.marble;
  context.font = `650 ${Math.min(17, Math.max(12, size.width * 0.021))}px ${fontFamily()}`;
  context.fillText(copy.completeHint, size.width / 2, y + panelHeight * 0.67, panelWidth - 54);
  context.fillStyle = MUSEUM_FEEL.palette.amber;
  context.font = `750 12px ${monoFamily()}`;
  context.fillText(`★★★★★  ${copy.galleryStars}`, size.width / 2, y + panelHeight * 0.84);
}

function centerOfPose(landmarks: readonly RuntimeLandmark[]): { x: number; y: number } | null {
  const visible = landmarks.filter((landmark) => landmark.visibility > 0.35 && landmark.presence > 0.35);
  if (visible.length === 0) return null;
  return {
    x: visible.reduce((total, landmark) => total + landmark.x, 0) / visible.length,
    y: visible.reduce((total, landmark) => total + landmark.y, 0) / visible.length,
  };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number): void {
  context.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seeded(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function fontFamily(): string {
  return '"Avenir Next", Avenir, "Noto Sans KR", system-ui, sans-serif';
}

function monoFamily(): string {
  return 'ui-monospace, "SFMono-Regular", Menlo, monospace';
}
