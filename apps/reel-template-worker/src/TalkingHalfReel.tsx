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
import {
  StyleProfile,
  TalkingHalfBlock,
  TalkingHalfProps,
  TalkingVisual,
  framesFor,
} from "./schema";

const { fontFamily: poppins } = loadPoppins("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

/* ---------------- profile-driven helpers (defensive) ---------------- */

const DARK_PANEL = "#0E0C08"; // bottom talking-head panel, per spec

const accentOf = (profile: StyleProfile, i = 0): string =>
  profile.color.accent?.[i] ??
  profile.color.accent?.[0] ??
  profile.color.primary ??
  "#2DD4BF";

const surfaceOf = (profile: StyleProfile): string =>
  profile.color.surface ?? profile.color.background ?? "#F3EEE3";

const inkOf = (profile: StyleProfile): string =>
  profile.color.ink ?? profile.color.text_on_bg ?? "#16241E";

const captionHiOf = (profile: StyleProfile): string =>
  profile.color.caption_highlight ?? accentOf(profile, 0);

const sizes = (profile: StyleProfile) => ({
  headline: profile.typography?.size_scale?.headline ?? 76,
  body: profile.typography?.size_scale?.body ?? 46,
  caption: profile.typography?.size_scale?.caption ?? 30,
});

const applyCase = (
  text: string,
  c: StyleProfile["typography"]["case"] | undefined,
): string => {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b\w/g, (m) => m.toUpperCase());
  return text;
};

const springCfg = (profile: StyleProfile) => ({
  stiffness: profile.motion?.spring_params?.stiffness ?? 130,
  damping: profile.motion?.spring_params?.damping ?? 16,
});

/* ---------------- shared pieces ---------------- */

// sharp editorial accent tag
const Tag: React.FC<{ text: string; profile: StyleProfile; delay?: number }> = ({
  text,
  profile,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { stiffness: 140, damping: 18 },
    durationInFrames: 14,
  });
  const SIZ = sizes(profile);
  return (
    <span
      style={{
        alignSelf: "flex-start",
        background: accentOf(profile, 0),
        color: profile.color.background ?? DARK_PANEL,
        fontFamily: poppins,
        fontWeight: 800,
        fontSize: SIZ.caption,
        letterSpacing: "0.08em",
        padding: "10px 20px",
        transform: `translateX(${interpolate(s, [0, 1], [-24, 0])}px)`,
        opacity: s,
        whiteSpace: "nowrap",
      }}
    >
      {text.toUpperCase()}
    </span>
  );
};

// Kinetic, word-by-word headline (ink on surface).
const Words: React.FC<{
  text: string;
  color: string;
  size: number;
  profile: StyleProfile;
}> = ({ text, color, size, profile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = springCfg(profile);
  return (
    <h1
      style={{
        margin: 0,
        fontFamily: poppins,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      }}
    >
      {text.split(/\s+/).map((w, i) => {
        const s = spring({ frame: frame - i * 2, fps, config: cfg });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.26em",
              fontWeight: 800,
              fontSize: size,
              color,
              transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
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

// Slow ken-burns b-roll with dark bottom overlay.
const Broll: React.FC<{ media: string }> = ({ media }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const ken = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.04, 1.13]);
  const punch = interpolate(frame, [0, 6], [1.06, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${ken * punch})` }}>
        {/\.(mp4|mov|webm)$/i.test(media) ? (
          <OffthreadVideo src={staticFile(media)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Img src={staticFile(media)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.02) 40%, rgba(0,0,0,0.65) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

/* ---------------- TOP half visuals ---------------- */

const TitleVisual: React.FC<{ v: TalkingVisual; profile: StyleProfile }> = ({
  v,
  profile,
}) => {
  const frame = useCurrentFrame();
  const SIZ = sizes(profile);
  const e = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{
        background: surfaceOf(profile),
        padding: "70px 64px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 28,
      }}
    >
      {v.kicker ? <Tag text={v.kicker} profile={profile} /> : null}
      <div
        style={{
          width: 64,
          height: 6,
          background: accentOf(profile, 0),
          transform: `scaleX(${e})`,
          transformOrigin: "left center",
        }}
      />
      {v.headline ? (
        <Words
          text={applyCase(v.headline, profile.typography?.case)}
          color={inkOf(profile)}
          size={Math.round(SIZ.headline * 0.92)}
          profile={profile}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const StatVisual: React.FC<{ v: TalkingVisual; profile: StyleProfile }> = ({
  v,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const SIZ = sizes(profile);
  const pop = spring({
    frame: frame - 3,
    fps,
    config: { stiffness: 160, damping: 12 },
  });
  return (
    <AbsoluteFill
      style={{
        background: surfaceOf(profile),
        padding: "70px 64px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {v.kicker ? <Tag text={v.kicker} profile={profile} /> : null}
      {v.stat ? (
        <div>
          <div
            style={{
              fontFamily: poppins,
              fontWeight: 800,
              fontSize: Math.round(SIZ.headline * 1.7),
              lineHeight: 1,
              letterSpacing: "-0.03em",
              color: accentOf(profile, 0),
              transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})`,
              transformOrigin: "left center",
              opacity: pop,
            }}
          >
            {v.stat.value}
          </div>
          <div
            style={{
              marginTop: 16,
              fontFamily: poppins,
              fontWeight: 700,
              fontSize: SIZ.body,
              color: inkOf(profile),
              maxWidth: 820,
              opacity: interpolate(frame, [8, 18], [0, 1], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            {v.stat.label}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const BulletsVisual: React.FC<{ v: TalkingVisual; profile: StyleProfile }> = ({
  v,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const SIZ = sizes(profile);
  const bullets = v.bullets ?? [];
  return (
    <AbsoluteFill
      style={{
        background: surfaceOf(profile),
        padding: "64px 60px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {v.kicker ? <Tag text={v.kicker} profile={profile} /> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {bullets.map((b, i) => {
          const s = spring({
            frame: frame - 6 - i * 7,
            fps,
            config: { stiffness: 120, damping: 16 },
          });
          return (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 22,
                alignItems: "flex-start",
                transform: `translateX(${interpolate(s, [0, 1], [40, 0])}px)`,
                opacity: s,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: poppins,
                  fontWeight: 800,
                  fontSize: SIZ.body,
                  lineHeight: 1.1,
                  color: accentOf(profile, 0),
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                style={{
                  fontFamily: poppins,
                  fontWeight: 700,
                  fontSize: SIZ.body * 0.92,
                  lineHeight: 1.15,
                  color: inkOf(profile),
                }}
              >
                {b}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const BrollVisual: React.FC<{ v: TalkingVisual; profile: StyleProfile }> = ({
  v,
  profile,
}) => {
  return (
    <AbsoluteFill style={{ background: DARK_PANEL, overflow: "hidden" }}>
      {v.media ? (
        <Broll media={v.media} />
      ) : (
        <AbsoluteFill style={{ background: surfaceOf(profile) }} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "44px 44px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {v.kicker ? <Tag text={v.kicker} profile={profile} /> : null}
      </div>
    </AbsoluteFill>
  );
};

const VISUALS: Record<
  TalkingVisual["kind"],
  React.FC<{ v: TalkingVisual; profile: StyleProfile }>
> = {
  title: TitleVisual,
  stat: StatVisual,
  bullets: BulletsVisual,
  broll: BrollVisual,
};

const TopHalf: React.FC<{ v: TalkingVisual; profile: StyleProfile }> = ({
  v,
  profile,
}) => {
  const Comp = VISUALS[v?.kind] ?? TitleVisual;
  return (
    <AbsoluteFill style={{ height: "50%", overflow: "hidden" }}>
      <Comp v={v} profile={profile} />
    </AbsoluteFill>
  );
};

/* ---------------- BOTTOM half (talking-head placeholder) ---------------- */

const BottomHalf: React.FC<{ profile: StyleProfile; handle: string; media?: string }> = ({
  profile,
  handle,
  media,
}) => {
  const SIZ = sizes(profile);
  return (
    <AbsoluteFill
      style={{
        top: "50%",
        height: "50%",
        background: DARK_PANEL,
        overflow: "hidden",
      }}
    >
      {media ? <Broll media={media} /> : <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          opacity: 0.16,
        }}
      >
        <svg
          width={84}
          height={84}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="1.5"
        >
          <rect x="2" y="6" width="14" height="12" />
          <path d="M16 10l6-3v10l-6-3" />
        </svg>
        <div
          style={{
            fontFamily: poppins,
            fontWeight: 700,
            color: "#fff",
            fontSize: 26,
            letterSpacing: "0.14em",
          }}
        >
          CREATOR FOOTAGE
        </div>
      </AbsoluteFill>}
      {/* speaker handle, small, in a corner */}
      {handle ? (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: 44,
            fontFamily: poppins,
            fontWeight: 700,
            fontSize: SIZ.caption * 0.82,
            letterSpacing: "0.06em",
            color: accentOf(profile, 0),
            opacity: 0.85,
          }}
        >
          {handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ---------------- caption (karaoke, at the seam) ---------------- */

const isKeyword = (w: string): boolean =>
  /[0-9₹%+\-]/.test(w) ||
  /^(everything|three|free|trust|zero|now|fix|fixes|win|wins)$/i.test(
    w.replace(/[.,!?]/g, ""),
  );

const SeamCaption: React.FC<{ spoken: string; profile: StyleProfile }> = ({
  spoken,
  profile,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const SIZ = sizes(profile);
  const words = (spoken ?? "").split(/\s+/).filter(Boolean);
  const shown = (frame / Math.max(1, durationInFrames)) * (words.length + 1);
  const hi = captionHiOf(profile);
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: 0,
        right: 0,
        transform: "translateY(-50%)",
        textAlign: "center",
        padding: "0 48px",
        fontFamily: poppins,
        zIndex: 6,
      }}
    >
      <span
        style={{
          background: DARK_PANEL,
          padding: "10px 18px",
          lineHeight: 1.5,
          fontWeight: 800,
          fontSize: SIZ.body * 0.9,
          WebkitBoxDecorationBreak: "clone",
          boxDecorationBreak: "clone",
        }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            style={{
              color: isKeyword(w) ? hi : "#fff",
              opacity: i < shown ? 1 : 0.4,
            }}
          >
            {w}{" "}
          </span>
        ))}
      </span>
    </div>
  );
};

/* ---------------- progress bar ---------------- */

const ProgressBar: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const pct = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 34,
        left: 60,
        width: width - 120,
        height: 5,
        background: "rgba(255,255,255,0.18)",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          background: accentOf(profile, 0),
        }}
      />
    </div>
  );
};

/* ---------------- beat ---------------- */

const Beat: React.FC<{
  block: TalkingHalfBlock;
  profile: StyleProfile;
  handle: string;
  durationInFrames: number;
}> = ({ block, profile, handle, durationInFrames }) => {
  const frame = useCurrentFrame();
  const entry = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(
    frame,
    [durationInFrames - 5, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const slide = interpolate(entry, [0, 1], [24, 0]);
  return (
    <AbsoluteFill
      style={{
        background: DARK_PANEL,
        opacity: entry * (1 - exit),
        transform: `translateY(${slide}px)`,
      }}
    >
      <TopHalf v={block.visual} profile={profile} />
      <BottomHalf profile={profile} handle={handle} media={block.visual.media} />
      {/* accent seam line separating the halves */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 5,
          background: accentOf(profile, 0),
          transform: "translateY(-2.5px)",
          zIndex: 5,
        }}
      />
      <SeamCaption spoken={block.spoken} profile={profile} />
    </AbsoluteFill>
  );
};

/* ---------------- composition ---------------- */

export const TalkingHalfReel: React.FC<TalkingHalfProps> = ({
  profile,
  speaker,
  blocks,
  fps,
}) => {
  let offset = 0;
  const handle = speaker?.handle ?? "";
  const list = blocks ?? [];
  return (
    <AbsoluteFill style={{ background: DARK_PANEL }}>
      {list.map((block, i) => {
        const dur = framesFor(block.duration_ms, profile, fps);
        const seq = (
          <Sequence
            key={i}
            from={offset}
            durationInFrames={dur}
            name={`beat-${i}-${block.visual?.kind ?? "title"}`}
          >
            <Beat
              block={block}
              profile={profile}
              handle={handle}
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
