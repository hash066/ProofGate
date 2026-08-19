import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import {
  ContentBlock,
  ReelProps,
  StyleProfile,
  blockFrames,
} from "./schema";

// Curated roster of widely-available open (Google) fonts the VLM extractor is told
// to choose from (see riff/slices/extraction/vlm.py _OPEN_FONTS). Keeping the two in
// sync means a font the model picks always resolves to a real loaded family rather
// than silently falling back. Display faces (Bebas Neue, Anton) only ship weight 400.
const { fontFamily: interFamily } = loadInter("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});
const { fontFamily: montserratFamily } = loadMontserrat("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});
const { fontFamily: poppinsFamily } = loadPoppins("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});
const { fontFamily: oswaldFamily } = loadOswald("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});
const { fontFamily: archivoFamily } = loadArchivo("normal", {
  weights: ["400", "600", "800"],
  subsets: ["latin"],
});
const { fontFamily: bebasFamily } = loadBebasNeue("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: antonFamily } = loadAnton("normal", {
  weights: ["400"],
  subsets: ["latin"],
});

// Match by substring so "Bebas Neue", "bebas", "BebasNeue" all resolve. Order matters:
// check the more specific names first. Unknown fonts fall back to Inter (neutral sans).
const resolveFont = (name: string): string => {
  const n = (name || "").toLowerCase();
  if (n.includes("bebas")) return bebasFamily;
  if (n.includes("anton")) return antonFamily;
  if (n.includes("oswald")) return oswaldFamily;
  if (n.includes("archivo")) return archivoFamily;
  if (n.includes("poppins")) return poppinsFamily;
  if (n.includes("montserrat")) return montserratFamily;
  if (n.includes("inter")) return interFamily;
  return interFamily;
};

const applyCase = (text: string, c: StyleProfile["typography"]["case"]): string => {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b\w/g, (m) => m.toUpperCase());
  return text;
};

const justifyFor = (
  pos: StyleProfile["layout"]["text_position"],
): React.CSSProperties["justifyContent"] =>
  pos === "top" ? "flex-start" : pos === "lower-third" ? "flex-end" : "center";

/** Slowly drifting, blurred accent blobs — depth without flat-color boredom. */
const BackgroundFX: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const a0 = profile.color.accent[0] ?? profile.color.primary;
  const a1 = profile.color.accent[1] ?? a0;
  const drift = (period: number, amp: number, phase = 0) =>
    Math.sin((frame / period) * Math.PI * 2 + phase) * amp;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: width * 0.9,
          height: width * 0.9,
          borderRadius: "50%",
          top: height * 0.05 + drift(180, 40),
          left: -width * 0.35 + drift(220, 30),
          background: a1,
          opacity: 0.1,
          filter: "blur(90px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.8,
          height: width * 0.8,
          borderRadius: "50%",
          bottom: height * 0.02 + drift(200, 36, 1.4),
          right: -width * 0.3 + drift(240, 28, 0.7),
          background: a0,
          opacity: 0.12,
          filter: "blur(90px)",
        }}
      />
    </AbsoluteFill>
  );
};

/** Overall progress across the whole reel — rendered at composition scope. */
const ProgressBar: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const pct = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 70,
        left: 80,
        width: width - 160,
        height: 8,
        borderRadius: 4,
        background: "rgba(255,255,255,0.12)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          borderRadius: 4,
          background: profile.color.accent[0] ?? profile.color.primary,
        }}
      />
    </div>
  );
};

const KineticWord: React.FC<{
  word: string;
  index: number;
  color: string;
  fontFamily: string;
  fontSize: number;
  stagger: number;
  cfg: { stiffness: number; damping: number };
}> = ({ word, index, color, fontFamily, fontSize, stagger, cfg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - index * stagger, fps, config: cfg });
  const y = interpolate(s, [0, 1], [70, 0]);
  const opacity = interpolate(s, [0, 1], [0, 1]);
  return (
    <span
      style={{
        display: "inline-block",
        marginRight: "0.28em",
        transform: `translateY(${y}px)`,
        opacity,
        color,
        fontFamily,
        fontSize,
        fontWeight: 800,
        lineHeight: 1.02,
      }}
    >
      {word}
    </span>
  );
};

const Block: React.FC<{
  block: ContentBlock;
  profile: StyleProfile;
  index: number;
  total: number;
  durationInFrames: number;
}> = ({ block, profile, index, total, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = {
    stiffness: profile.motion.spring_params.stiffness,
    damping: profile.motion.spring_params.damping,
  };

  const emphasisColor = profile.color.accent[0] ?? profile.color.primary;
  const color = block.emphasis ? emphasisColor : profile.color.text_on_bg;
  const fontSize = block.emphasis
    ? Math.round(profile.typography.size_scale.headline * 1.12)
    : profile.typography.size_scale.headline;
  const font = resolveFont(profile.typography.primary_font);
  const stagger = Math.max(1, Math.round((profile.motion.default_in_ms / 1000) * fps) / 3);

  const words = applyCase(block.text, profile.typography.case).split(/\s+/);

  // Underline wipe for emphasis, timed to land after the words settle.
  const underline = spring({
    frame: frame - words.length * stagger,
    fps,
    config: { stiffness: 90, damping: 18 },
  });

  // Whole-block exit: fade + drift up in the final beats.
  const exit = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const blockOpacity = 1 - exit;
  const blockY = -exit * 40;

  return (
    <AbsoluteFill
      style={{
        justifyContent: justifyFor(profile.layout.text_position),
        alignItems: "center",
        padding: 90,
        paddingBottom: profile.layout.text_position === "lower-third" ? 300 : 120,
        opacity: blockOpacity,
        transform: `translateY(${blockY}px)`,
      }}
    >
      {/* Kicker index, in accent */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 90,
          fontFamily: resolveFont(profile.typography.primary_font),
          fontWeight: 600,
          fontSize: profile.typography.size_scale.caption,
          letterSpacing: "0.18em",
          color: emphasisColor,
          opacity: interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </div>

      <div
        style={{
          textAlign: "center",
          maxWidth: "92%",
          letterSpacing: profile.typography.case === "upper" ? "-0.01em" : "-0.02em",
        }}
      >
        {words.map((w, i) => (
          <KineticWord
            key={i}
            word={w}
            index={i}
            color={color}
            fontFamily={font}
            fontSize={fontSize}
            stagger={stagger}
            cfg={cfg}
          />
        ))}
        {block.emphasis && (
          <div
            style={{
              height: 12,
              width: 220,
              margin: "36px auto 0",
              borderRadius: 6,
              background: emphasisColor,
              transform: `scaleX(${underline})`,
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

export const InfographicReel: React.FC<ReelProps> = ({ profile, blocks, fps }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: profile.color.background }}>
      <BackgroundFX profile={profile} />
      {blocks.map((block, i) => {
        const dur = blockFrames(block, profile, fps);
        const seq = (
          <Sequence key={i} from={offset} durationInFrames={dur} name={`block-${i}`}>
            <Block
              block={block}
              profile={profile}
              index={i}
              total={blocks.length}
              durationInFrames={dur}
            />
          </Sequence>
        );
        offset += dur;
        return seq;
      })}
      <ProgressBar profile={profile} />
    </AbsoluteFill>
  );
};
