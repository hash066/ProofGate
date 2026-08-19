import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import {
  FullInfographicProps,
  InfoBlock,
  StyleProfile,
  framesFor,
} from "./schema";

const { fontFamily: poppins } = loadPoppins("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

/* ---------------- profile-driven helpers ---------------- */

const accentAt = (profile: StyleProfile, i: number): string => {
  const a = profile.color.accent;
  if (a && a.length > 0) return a[i % a.length] ?? a[0];
  return profile.color.primary;
};

const applyCase = (
  text: string,
  c: StyleProfile["typography"]["case"],
): string => {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b\w/g, (m) => m.toUpperCase());
  return text;
};

// A muted variant of the on-bg text colour for secondary/desc lines.
const mutedInk = (profile: StyleProfile): string => profile.color.text_on_bg;

const useEntry = (delay = 0, profile?: StyleProfile) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stiffness = profile?.motion.spring_params.stiffness ?? 120;
  const damping = profile?.motion.spring_params.damping ?? 18;
  return spring({
    frame: frame - delay,
    fps,
    config: { stiffness, damping },
    durationInFrames: 16,
  });
};

/* ---------------- calm editorial background ---------------- */

const EditorialBG: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const accent = accentAt(profile, 0);
  const line = "rgba(255,255,255,0.06)";
  const drift = (period: number, amp: number, ph = 0) =>
    Math.sin((frame / period) * Math.PI * 2 + ph) * amp;
  return (
    <AbsoluteFill
      style={{ background: profile.color.background, overflow: "hidden" }}
    >
      {/* faint drifting grid */}
      <div
        style={{
          position: "absolute",
          inset: -120,
          backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          transform: `translate(${drift(680, 14)}px, ${drift(820, 14, 1)}px)`,
        }}
      />
      {/* one slow accent rule sweeping vertically */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${64 + drift(1000, 4)}%`,
          height: 2,
          background: accent,
          opacity: 0.16,
        }}
      />
    </AbsoluteFill>
  );
};

/* ---------------- shared pieces ---------------- */

const Kicker: React.FC<{ text: string; profile: StyleProfile }> = ({
  text,
  profile,
}) => {
  const e = useEntry(0, profile);
  return (
    <span
      style={{
        alignSelf: "flex-start",
        background: accentAt(profile, 0),
        color: profile.color.background,
        fontWeight: 800,
        fontSize: profile.typography.size_scale.caption,
        letterSpacing: "0.08em",
        padding: "10px 20px",
        transform: `translateX(${interpolate(e, [0, 1], [-26, 0])}px)`,
        opacity: e,
      }}
    >
      {text.toUpperCase()}
    </span>
  );
};

// Kinetic, word-by-word headline driven by the profile spring.
const Words: React.FC<{
  text: string;
  color: string;
  size: number;
  profile: StyleProfile;
  align?: "left" | "center";
  delay?: number;
}> = ({ text, color, size, profile, align = "left", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = {
    stiffness: profile.motion.spring_params.stiffness,
    damping: profile.motion.spring_params.damping,
  };
  const cased = applyCase(text, profile.typography.case);
  return (
    <h1
      style={{
        margin: 0,
        textAlign: align,
        letterSpacing: "-0.02em",
        lineHeight: 1.06,
      }}
    >
      {cased.split(/\s+/).map((w, i) => {
        const s = spring({ frame: frame - delay - i * 2, fps, config: cfg });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.26em",
              fontWeight: 800,
              fontSize: size,
              color,
              transform: `translateY(${interpolate(s, [0, 1], [32, 0])}px)`,
              opacity: interpolate(s, [0, 1], [0, 1]),
            }}
          >
            {w}
          </span>
        );
      })}
    </h1>
  );
};

const Caption: React.FC<{ text: string; profile: StyleProfile }> = ({
  text,
  profile,
}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [6, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 110,
        left: 84,
        right: 84,
        fontFamily: poppins,
        fontWeight: 500,
        fontSize: profile.typography.size_scale.caption,
        color: mutedInk(profile),
        opacity: op * 0.7,
        lineHeight: 1.35,
      }}
    >
      {text}
    </div>
  );
};

/* ---------------- per-kind beats ---------------- */

const SIZ = (profile: StyleProfile) => ({
  headline: profile.typography.size_scale.headline,
  body: profile.typography.size_scale.body,
  caption: profile.typography.size_scale.caption,
});

const TitleBeat: React.FC<{ block: InfoBlock; profile: StyleProfile }> = ({
  block,
  profile,
}) => {
  const e = useEntry(2, profile);
  const siz = SIZ(profile);
  return (
    <AbsoluteFill
      style={{
        padding: "0 84px",
        justifyContent: "center",
        fontFamily: poppins,
      }}
    >
      {block.kicker ? (
        <div style={{ marginBottom: 30 }}>
          <Kicker text={block.kicker} profile={profile} />
        </div>
      ) : null}
      {block.title ? (
        <Words
          text={block.title}
          color={profile.color.text_on_bg}
          size={Math.round(siz.headline * 1.02)}
          profile={profile}
          align="left"
          delay={2}
        />
      ) : null}
      <div
        style={{
          marginTop: 40,
          width: interpolate(e, [0, 1], [0, 320]),
          height: 8,
          background: accentAt(profile, 0),
        }}
      />
    </AbsoluteFill>
  );
};

const StatBeat: React.FC<{ block: InfoBlock; profile: StyleProfile }> = ({
  block,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: frame - 3,
    fps,
    config: { stiffness: 160, damping: 13 },
  });
  const siz = SIZ(profile);
  return (
    <AbsoluteFill
      style={{
        padding: "0 84px",
        justifyContent: "center",
        fontFamily: poppins,
      }}
    >
      {block.kicker ? (
        <div style={{ marginBottom: 28 }}>
          <Kicker text={block.kicker} profile={profile} />
        </div>
      ) : null}
      {block.stat ? (
        <>
          <div
            style={{
              fontWeight: 800,
              fontSize: Math.round(siz.headline * 2.3),
              lineHeight: 0.92,
              letterSpacing: "-0.03em",
              color: accentAt(profile, 0),
              transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
              transformOrigin: "left center",
              opacity: pop,
            }}
          >
            {block.stat.value}
          </div>
          <div
            style={{
              marginTop: 24,
              fontWeight: 700,
              fontSize: siz.body,
              color: profile.color.text_on_bg,
              maxWidth: 820,
              opacity: interpolate(frame, [10, 20], [0, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            {block.stat.label}
          </div>
        </>
      ) : null}
      {block.caption ? <Caption text={block.caption} profile={profile} /> : null}
    </AbsoluteFill>
  );
};

const BarsBeat: React.FC<{ block: InfoBlock; profile: StyleProfile }> = ({
  block,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const siz = SIZ(profile);
  const bars = block.bars ?? [];
  // The least bar (smallest pct) gets the accent emphasis.
  let leastIdx = -1;
  let leastPct = Infinity;
  bars.forEach((b, i) => {
    if (b.pct < leastPct) {
      leastPct = b.pct;
      leastIdx = i;
    }
  });
  return (
    <AbsoluteFill style={{ padding: "0 84px", fontFamily: poppins }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "150px 84px 200px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {block.kicker ? <Kicker text={block.kicker} profile={profile} /> : null}
        {block.title ? (
          <div
            style={{
              marginTop: 24,
              fontWeight: 800,
              fontSize: Math.round(siz.headline * 0.66),
              color: profile.color.text_on_bg,
              lineHeight: 1.12,
            }}
          >
            {applyCase(block.title, profile.typography.case)}
          </div>
        ) : null}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "flex-end",
            gap: 56,
            height: 700,
          }}
        >
          {bars.map((b, i) => {
            const s = spring({
              frame: frame - 8 - i * 8,
              fps,
              config: { stiffness: 90, damping: 16 },
            });
            const barPx = interpolate(s, [0, 1], [0, (b.pct / 100) * 540]);
            const isAccent = i === leastIdx;
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: siz.body,
                    color: isAccent
                      ? accentAt(profile, 0)
                      : profile.color.text_on_bg,
                    marginBottom: 14,
                    opacity: s,
                  }}
                >
                  {b.value}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: Math.max(0, barPx),
                    background: isAccent
                      ? accentAt(profile, 0)
                      : profile.color.text_on_bg,
                    opacity: isAccent ? 1 : 0.24,
                  }}
                />
                <div
                  style={{
                    marginTop: 18,
                    fontWeight: 700,
                    fontSize: siz.caption,
                    color: mutedInk(profile),
                    opacity: 0.7,
                    textAlign: "center",
                  }}
                >
                  {b.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {block.caption ? <Caption text={block.caption} profile={profile} /> : null}
    </AbsoluteFill>
  );
};

const ListBeat: React.FC<{ block: InfoBlock; profile: StyleProfile }> = ({
  block,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const siz = SIZ(profile);
  const items = block.items ?? [];
  const line = "rgba(255,255,255,0.14)";
  return (
    <AbsoluteFill style={{ fontFamily: poppins }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "150px 84px 200px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {block.kicker ? <Kicker text={block.kicker} profile={profile} /> : null}
        {block.title ? (
          <div
            style={{
              marginTop: 24,
              fontWeight: 800,
              fontSize: Math.round(siz.headline * 0.62),
              color: profile.color.text_on_bg,
              lineHeight: 1.12,
            }}
          >
            {applyCase(block.title, profile.typography.case)}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 28,
            margin: "auto 0",
          }}
        >
          {items.map((it, i) => {
            const s = spring({
              frame: frame - 10 - i * 8,
              fps,
              config: {
                stiffness: profile.motion.spring_params.stiffness,
                damping: profile.motion.spring_params.damping,
              },
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 26,
                  alignItems: "flex-start",
                  transform: `translateX(${interpolate(s, [0, 1], [44, 0])}px)`,
                  opacity: s,
                  borderTop: `2px solid ${line}`,
                  paddingTop: 22,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontWeight: 800,
                    fontSize: Math.round(siz.headline * 0.86),
                    lineHeight: 0.9,
                    color: accentAt(profile, 0),
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: siz.body,
                      color: profile.color.text_on_bg,
                      lineHeight: 1.1,
                    }}
                  >
                    {it.title}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontWeight: 500,
                      fontSize: Math.round(siz.caption * 1.1),
                      color: mutedInk(profile),
                      opacity: 0.7,
                      lineHeight: 1.3,
                    }}
                  >
                    {it.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {block.caption ? <Caption text={block.caption} profile={profile} /> : null}
    </AbsoluteFill>
  );
};

const QuoteBeat: React.FC<{ block: InfoBlock; profile: StyleProfile }> = ({
  block,
  profile,
}) => {
  const frame = useCurrentFrame();
  const e = useEntry(2, profile);
  const siz = SIZ(profile);
  return (
    <AbsoluteFill
      style={{
        padding: "0 84px",
        justifyContent: "center",
        fontFamily: poppins,
      }}
    >
      {block.kicker ? (
        <div style={{ marginBottom: 18 }}>
          <Kicker text={block.kicker} profile={profile} />
        </div>
      ) : null}
      <div
        style={{
          fontWeight: 800,
          fontSize: Math.round(siz.headline * 2.6),
          lineHeight: 0.7,
          color: accentAt(profile, 0),
          opacity: e,
          transform: `translateY(${interpolate(e, [0, 1], [20, 0])}px)`,
        }}
      >
        &ldquo;
      </div>
      {block.quote ? (
        <div style={{ marginTop: 8 }}>
          <Words
            text={block.quote}
            color={profile.color.text_on_bg}
            size={Math.round(siz.headline * 0.84)}
            profile={profile}
            align="left"
            delay={4}
          />
        </div>
      ) : null}
      {block.attribution ? (
        <div
          style={{
            marginTop: 32,
            fontWeight: 600,
            fontSize: siz.body,
            color: mutedInk(profile),
            opacity: interpolate(frame, [16, 28], [0, 0.7], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {block.attribution}
        </div>
      ) : null}
      {block.caption ? <Caption text={block.caption} profile={profile} /> : null}
    </AbsoluteFill>
  );
};

const BEATS: Record<
  InfoBlock["kind"],
  React.FC<{ block: InfoBlock; profile: StyleProfile }>
> = {
  title: TitleBeat,
  stat: StatBeat,
  bars: BarsBeat,
  list: ListBeat,
  quote: QuoteBeat,
};

/* ---------------- beat wrapper (entry + exit + punch-in) ---------------- */

const Beat: React.FC<{
  block: InfoBlock;
  profile: StyleProfile;
  durationInFrames: number;
}> = ({ block, profile, durationInFrames }) => {
  const frame = useCurrentFrame();
  const Comp = BEATS[block.kind] ?? TitleBeat;
  const entry = interpolate(frame, [0, 4], [0, 1], {
    extrapolateRight: "clamp",
  });
  const exit = interpolate(
    frame,
    [durationInFrames - 6, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  // quick punch-in on the hard cut
  const punch = interpolate(frame, [0, 6], [1.03, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: profile.color.background }}>
      <EditorialBG profile={profile} />
      <AbsoluteFill
        style={{
          opacity: entry * (1 - exit),
          transform: `scale(${punch}) translateY(${exit * -30}px)`,
        }}
      >
        <Comp block={block} profile={profile} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

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
        bottom: 48,
        left: 84,
        width: width - 168,
        height: 5,
        background: "rgba(255,255,255,0.16)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: accentAt(profile, 0),
        }}
      />
    </div>
  );
};

export const FullInfographicReel: React.FC<FullInfographicProps> = ({
  profile,
  blocks,
  fps,
}) => {
  let offset = 0;
  const safeBlocks = blocks ?? [];
  return (
    <AbsoluteFill style={{ background: profile.color.background }}>
      {safeBlocks.map((block, i) => {
        const dur = framesFor(block.duration_ms, profile, fps);
        const seq = (
          <Sequence
            key={i}
            from={offset}
            durationInFrames={dur}
            name={`beat-${i}-${block.kind}`}
          >
            <Beat block={block} profile={profile} durationInFrames={dur} />
          </Sequence>
        );
        offset += dur;
        return seq;
      })}
      <ProgressBar profile={profile} />
    </AbsoluteFill>
  );
};
