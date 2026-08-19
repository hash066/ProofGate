import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { ExplainerBlock, ExplainerProps, framesFor } from "./schema";

const { fontFamily: poppins } = loadPoppins("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

/* ---------------- palettes (editorial; flat, no shadows) ---------------- */

type Pal = {
  bg: string;
  text: string;
  sub: string;
  accent: string;
  onAccent: string;
  line: string;
  dark: boolean;
};

const PALETTES: Record<string, Pal> = {
  paper: { bg: "#EDE6D6", text: "#1A1712", sub: "#5C554A", accent: "#C0392B", onAccent: "#FFFFFF", line: "rgba(26,23,18,0.12)", dark: false },
  ink: { bg: "#15120D", text: "#EDE6D6", sub: "#A99E86", accent: "#E0A93B", onAccent: "#15120D", line: "rgba(237,230,214,0.12)", dark: true },
  forest: { bg: "#0E2A22", text: "#E6F1EB", sub: "#8FB6A6", accent: "#3FD39B", onAccent: "#06231B", line: "rgba(230,241,235,0.12)", dark: true },
  slate: { bg: "#101826", text: "#E8EEF7", sub: "#8B9CB5", accent: "#5AA2FF", onAccent: "#06121F", line: "rgba(232,238,247,0.12)", dark: true },
};
const pal = (name?: string): Pal => PALETTES[name ?? "paper"] ?? PALETTES.paper;

const SIZ = { headline: 76, body: 46, caption: 30 };

/* ---------------- shared pieces ---------------- */

const useEntry = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { stiffness: 120, damping: 18 }, durationInFrames: 14 });
};

// Soft, slow editorial background motion behind infographic shots.
const EditorialBG: React.FC<{ p: Pal }> = ({ p }) => {
  const frame = useCurrentFrame();
  const d = (period: number, amp: number, ph = 0) => Math.sin((frame / period) * Math.PI * 2 + ph) * amp;
  return (
    <AbsoluteFill style={{ background: p.bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -120,
          backgroundImage: `linear-gradient(${p.line} 1px, transparent 1px), linear-gradient(90deg, ${p.line} 1px, transparent 1px)`,
          backgroundSize: "72px 72px",
          transform: `translate(${d(620, 16)}px, ${d(760, 16, 1)}px)`,
        }}
      />
      {/* big rotating square outline */}
      <div
        style={{
          position: "absolute",
          width: 980,
          height: 980,
          left: "50%",
          top: "44%",
          marginLeft: -490,
          marginTop: -490,
          border: `2px solid ${p.accent}`,
          opacity: 0.12,
          transform: `rotate(${frame * 0.05}deg)`,
        }}
      />
      {/* drifting accent block */}
      <div
        style={{
          position: "absolute",
          width: 340,
          height: 340,
          right: -70,
          top: `${8 + d(540, 2)}%`,
          background: p.accent,
          opacity: 0.045,
          transform: `translateY(${d(520, 26)}px)`,
        }}
      />
      {/* sweeping rule */}
      <div style={{ position: "absolute", left: 0, right: 0, top: `${72 + d(900, 4)}%`, height: 2, background: p.accent, opacity: 0.14 }} />
    </AbsoluteFill>
  );
};

const Broll: React.FC<{ media: string }> = ({ media }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ken = interpolate(frame, [0, durationInFrames], [1.04, 1.13]);
  const punch = interpolate(frame, [0, 6], [1.06, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${ken * punch})` }}>
        {/\.(mp4|mov|webm)$/i.test(media) ? (
          <OffthreadVideo src={staticFile(media)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={staticFile(media)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.05) 32%, rgba(0,0,0,0.10) 60%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
};

// sharp editorial tag
const Tag: React.FC<{ text: string; p: Pal }> = ({ text, p }) => {
  const e = useEntry();
  return (
    <span
      style={{
        alignSelf: "flex-start",
        background: p.accent,
        color: p.onAccent,
        fontWeight: 800,
        fontSize: SIZ.caption,
        letterSpacing: "0.08em",
        padding: "10px 20px",
        transform: `translateX(${interpolate(e, [0, 1], [-24, 0])}px)`,
        opacity: e,
      }}
    >
      {text.toUpperCase()}
    </span>
  );
};

const Words: React.FC<{ text: string; color: string; size: number; align?: "left" | "center" }> = ({
  text,
  color,
  size,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <h1 style={{ margin: 0, textAlign: align, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
      {text.split(/\s+/).map((w, i) => {
        const s = spring({ frame: frame - i * 2, fps, config: { stiffness: 130, damping: 16 } });
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.26em", fontWeight: 800, fontSize: size, color, transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`, opacity: interpolate(s, [0, 1], [0, 1]) }}>
            {w}
          </span>
        );
      })}
    </h1>
  );
};

// Caption: solid sharp box, per-line background, no shadow.
const isHi = (w: string) => /[0-9₹%]/.test(w) || /^(zero|trust|free)$/i.test(w.replace(/[.,?]/g, ""));
const Caption: React.FC<{ spoken: string; p: Pal; top: string }> = ({ spoken, p, top }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const words = spoken.split(/\s+/);
  const shown = (frame / durationInFrames) * (words.length + 1);
  return (
    <div style={{ position: "absolute", top, left: 0, right: 0, textAlign: "center", padding: "0 56px", fontFamily: poppins }}>
      <span
        style={{
          background: "#0E0C08",
          color: "#fff",
          padding: "8px 16px",
          lineHeight: 1.55,
          fontWeight: 800,
          fontSize: SIZ.body,
          WebkitBoxDecorationBreak: "clone",
          boxDecorationBreak: "clone",
        }}
      >
        {words.map((w, i) => (
          <span key={i} style={{ color: isHi(w) ? p.accent : "#fff", opacity: i < shown ? 1 : 0.5 }}>
            {w}{" "}
          </span>
        ))}
      </span>
    </div>
  );
};

const FaceGhost: React.FC<{ small?: boolean }> = ({ small }) => (
  <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.16 }}>
    <svg width={small ? 52 : 76} height={small ? 52 : 76} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.5">
      <rect x="2" y="6" width="14" height="12" />
      <path d="M16 10l6-3v10l-6-3" />
    </svg>
    <div style={{ fontFamily: poppins, fontWeight: 700, color: "#fff", fontSize: small ? 18 : 26, letterSpacing: "0.12em" }}>CREATOR FOOTAGE</div>
  </AbsoluteFill>
);

/* ---------------- shots ---------------- */

const TitleShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const e = useEntry();
  return (
    <AbsoluteFill>
      {block.slide.media ? <Broll media={block.slide.media} /> : <AbsoluteFill style={{ background: p.bg }} />}
      <AbsoluteFill style={{ padding: "0 80px", justifyContent: "center", alignItems: "center", fontFamily: poppins }}>
        <div style={{ width: 64, height: 6, background: p.accent, marginBottom: 28, transform: `scaleX(${e})`, transformOrigin: "center" }} />
        <Words text={block.slide.headline} color="#fff" size={Math.round(SIZ.headline * 1.08)} align="center" />
        {block.slide.kicker && (
          <div style={{ marginTop: 30 }}>
            <Tag text={block.slide.kicker} p={p} />
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SpeakerFullShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  return (
    <AbsoluteFill style={{ background: "#0E0C08" }}>
      {block.slide.media ? <Broll media={block.slide.media} /> : <FaceGhost />}
      <Caption spoken={block.spoken} p={p} top="78%" />
    </AbsoluteFill>
  );
};

// Big circular cut-out of the creator (his photo here) at centre, over animated bg.
const SpeakerCircleShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const frame = useCurrentFrame();
  const e = useEntry();
  const D = 840;
  return (
    <AbsoluteFill>
      <EditorialBG p={p} />
      {/* rotating sharp square framing the circle */}
      <div
        style={{
          position: "absolute",
          width: D + 60,
          height: D + 60,
          left: "50%",
          top: 560,
          marginLeft: -(D + 60) / 2,
          marginTop: -(D + 60) / 2,
          border: `3px solid ${p.accent}`,
          opacity: 0.35,
          transform: `rotate(${45 + frame * 0.05}deg) scale(${interpolate(e, [0, 1], [0.7, 1])})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: D,
          height: D,
          left: "50%",
          top: 560,
          marginLeft: -D / 2,
          marginTop: -D / 2,
          borderRadius: "50%",
          overflow: "hidden",
          border: `8px solid ${p.accent}`,
          transform: `scale(${interpolate(e, [0, 1], [0.82, 1])})`,
          background: "#0E0C08",
        }}
      >
        {block.slide.media ? <Broll media={block.slide.media} /> : <FaceGhost small />}
      </div>
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center", fontFamily: poppins }}>
        {block.slide.kicker && <Tag text={block.slide.kicker} p={p} />}
      </div>
      <Caption spoken={block.spoken} p={p} top="80%" />
    </AbsoluteFill>
  );
};

const SplitShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const e = useEntry();
  return (
    <AbsoluteFill style={{ background: "#0E0C08" }}>
      <div style={{ height: "50%", position: "relative", overflow: "hidden", transform: `translateY(${interpolate(e, [0, 1], [-50, 0])}px)` }}>
        {block.slide.media ? <Broll media={block.slide.media} /> : <FaceGhost small />}
        <div style={{ position: "absolute", inset: 0, padding: "64px", fontFamily: poppins }}>
          {block.slide.kicker && <Tag text={block.slide.kicker} p={p} />}
        </div>
      </div>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, bottom: 0, transform: `translateY(${interpolate(e, [0, 1], [50, 0])}px)` }}>
        <FaceGhost />
      </div>
      {/* accent seam */}
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 5, background: p.accent }} />
      <Caption spoken={block.spoken} p={p} top="54%" />
    </AbsoluteFill>
  );
};

const BrollStatShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { slide } = block;
  const pop = spring({ frame: frame - 3, fps, config: { stiffness: 160, damping: 12 } });
  return (
    <AbsoluteFill>
      {slide.media ? <Broll media={slide.media} /> : <FaceGhost />}
      <div style={{ position: "absolute", inset: 0, padding: "76px 70px", display: "flex", flexDirection: "column", fontFamily: poppins }}>
        {slide.kicker && <Tag text={slide.kicker} p={p} />}
        {slide.stat && (
          <div style={{ margin: "auto 0" }}>
            <div style={{ display: "inline-block", background: p.accent, color: p.onAccent, fontWeight: 800, fontSize: Math.round(SIZ.headline * 1.7), lineHeight: 1, padding: "6px 18px", letterSpacing: "-0.03em", transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`, transformOrigin: "left center", opacity: pop }}>
              {slide.stat.value}
            </div>
            <div style={{ marginTop: 18, fontWeight: 800, fontSize: SIZ.body, color: "#fff", maxWidth: 760, opacity: interpolate(frame, [8, 18], [0, 1], { extrapolateRight: "clamp" }) }}>
              <span style={{ background: "#0E0C08", padding: "6px 12px", WebkitBoxDecorationBreak: "clone", boxDecorationBreak: "clone", lineHeight: 1.5 }}>{slide.stat.label}</span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

const ChartBarsShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = block.slide.bars ?? [];
  return (
    <AbsoluteFill style={{ fontFamily: poppins }}>
      <EditorialBG p={p} />
      <div style={{ position: "absolute", inset: 0, padding: "120px 84px", display: "flex", flexDirection: "column" }}>
        {block.slide.kicker && <Tag text={block.slide.kicker} p={p} />}
        {block.slide.headline ? (
          <div style={{ marginTop: 26, fontWeight: 800, fontSize: SIZ.headline * 0.72, color: p.text, lineHeight: 1.1 }}>{block.slide.headline}</div>
        ) : null}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "stretch", gap: 64, height: 660 }}>
          {bars.map((b, i) => {
            const s = spring({ frame: frame - 8 - i * 8, fps, config: { stiffness: 90, damping: 16 } });
            const barPx = interpolate(s, [0, 1], [0, (b.pct / 100) * 520]);
            const isLast = i === bars.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: SIZ.body, color: p.accent, marginBottom: 14, opacity: s }}>{b.value}</div>
                <div style={{ width: "100%", height: barPx, background: isLast ? p.accent : p.text, opacity: isLast ? 1 : 0.24 }} />
                <div style={{ marginTop: 18, fontWeight: 700, fontSize: SIZ.caption, color: p.sub, textAlign: "center" }}>{b.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ListDetailShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = block.slide.items ?? [];
  return (
    <AbsoluteFill style={{ fontFamily: poppins }}>
      <EditorialBG p={p} />
      <div style={{ position: "absolute", inset: 0, padding: "118px 84px", display: "flex", flexDirection: "column", gap: 30 }}>
        {block.slide.kicker && <Tag text={block.slide.kicker} p={p} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 30, margin: "auto 0" }}>
          {items.map((it, i) => {
            const s = spring({ frame: frame - 8 - i * 8, fps, config: { stiffness: 110, damping: 16 } });
            return (
              <div key={i} style={{ display: "flex", gap: 26, alignItems: "flex-start", transform: `translateX(${interpolate(s, [0, 1], [44, 0])}px)`, opacity: s, borderTop: `2px solid ${p.line}`, paddingTop: 24 }}>
                <span style={{ flexShrink: 0, fontWeight: 800, fontSize: SIZ.headline * 0.95, lineHeight: 0.9, color: p.accent }}>{i + 1}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: SIZ.body, color: p.text, lineHeight: 1.1 }}>{it.title}</div>
                  <div style={{ marginTop: 8, fontWeight: 500, fontSize: SIZ.caption * 1.12, color: p.sub, lineHeight: 1.3 }}>{it.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StatDetailShot: React.FC<{ block: ExplainerBlock }> = ({ block }) => {
  const p = pal(block.slide.palette);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 4, fps, config: { stiffness: 150, damping: 13 } });
  const subs = block.slide.substats ?? [];
  return (
    <AbsoluteFill style={{ fontFamily: poppins }}>
      <EditorialBG p={p} />
      <div style={{ position: "absolute", inset: 0, padding: "120px 84px", display: "flex", flexDirection: "column" }}>
        {block.slide.kicker && <Tag text={block.slide.kicker} p={p} />}
        <div style={{ margin: "auto 0" }}>
          <div style={{ fontWeight: 800, fontSize: SIZ.headline * 2.1, lineHeight: 0.95, color: p.accent, letterSpacing: "-0.03em", transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`, transformOrigin: "left center", opacity: pop }}>
            {block.slide.stat?.value}
          </div>
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: SIZ.body, color: p.text, maxWidth: 820 }}>{block.slide.stat?.label}</div>
          {subs.length > 0 && (
            <div style={{ marginTop: 50, display: "flex", gap: 0, borderTop: `2px solid ${p.line}` }}>
              {subs.map((s, i) => {
                const e = spring({ frame: frame - 16 - i * 6, fps, config: { stiffness: 120, damping: 16 } });
                return (
                  <div key={i} style={{ flex: 1, padding: "26px 20px 0", borderRight: i < subs.length - 1 ? `2px solid ${p.line}` : "none", opacity: e }}>
                    <div style={{ fontWeight: 800, fontSize: SIZ.body, color: p.text }}>{s.value}</div>
                    <div style={{ marginTop: 6, fontWeight: 500, fontSize: SIZ.caption, color: p.sub }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SHOTS: Record<string, React.FC<{ block: ExplainerBlock }>> = {
  title: TitleShot,
  speaker_full: SpeakerFullShot,
  speaker_circle: SpeakerCircleShot,
  split: SplitShot,
  broll_full: BrollStatShot,
  chart_bars: ChartBarsShot,
  list_detail: ListDetailShot,
  stat_detail: StatDetailShot,
};

const Beat: React.FC<{ block: ExplainerBlock; durationInFrames: number }> = ({ block, durationInFrames }) => {
  const frame = useCurrentFrame();
  const ShotComp = SHOTS[block.slide.shot ?? "split"] ?? SplitShot;
  const entry = interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(frame, [durationInFrames - 5, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: entry * (1 - exit), background: "#0E0C08" }}>
      <ShotComp block={block} />
    </AbsoluteFill>
  );
};

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames - 1], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", bottom: 40, left: 70, width: width - 140, height: 5, background: "rgba(255,255,255,0.18)", zIndex: 10 }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: "#fff" }} />
    </div>
  );
};

export const SplitExplainerReel: React.FC<ExplainerProps> = ({ profile, blocks, fps }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: "#0E0C08" }}>
      {blocks.map((block, i) => {
        const dur = framesFor(block.duration_ms, profile, fps);
        const seq = (
          <Sequence key={i} from={offset} durationInFrames={dur} name={`beat-${i}-${block.slide.shot ?? "split"}`}>
            <Beat block={block} durationInFrames={dur} />
          </Sequence>
        );
        offset += dur;
        return seq;
      })}
      <ProgressBar />
    </AbsoluteFill>
  );
};
