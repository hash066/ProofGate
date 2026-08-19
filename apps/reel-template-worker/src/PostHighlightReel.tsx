import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import {
  HighlightBeat,
  PostHighlightProps,
  Post,
  StyleProfile,
  framesFor,
} from "./schema";

const { fontFamily: poppins } = loadPoppins("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

/* ---------------- helpers (all defensive against missing fields) ---------------- */

const applyCase = (
  text: string,
  c: StyleProfile["typography"]["case"] | undefined,
): string => {
  if (c === "upper") return text.toUpperCase();
  if (c === "title") return text.replace(/\b\w/g, (m) => m.toUpperCase());
  return text;
};

const initials = (name: string): string =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "?";

const platformGlyph = (platform?: string): string => {
  switch ((platform ?? "").toLowerCase()) {
    case "x":
    case "twitter":
      return "𝕏"; // 𝕏
    case "instagram":
    case "ig":
      return "◉"; // ◉
    case "linkedin":
      return "in";
    case "threads":
      return "@";
    default:
      return platform ? platform.charAt(0).toUpperCase() : "";
  }
};

// Find a case-insensitive substring; returns [start, end) or null.
const findSpan = (
  body: string,
  phrase?: string,
): [number, number] | null => {
  if (!phrase) return null;
  const idx = body.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx < 0) return null;
  return [idx, idx + phrase.length];
};

/* ---------------- background (flat, subtle drifting rule — no gradients) ------- */

const EditorialBG: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const accent =
    profile.color.accent?.[0] ?? profile.color.primary ?? "#000000";
  const line = `${accent}1A`; // ~10% alpha hex suffix
  const d = (period: number, amp: number, ph = 0) =>
    Math.sin((frame / period) * Math.PI * 2 + ph) * amp;
  return (
    <AbsoluteFill
      style={{ background: profile.color.background, overflow: "hidden" }}
    >
      <div
        style={{
          position: "absolute",
          inset: -140,
          backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
          backgroundSize: "84px 84px",
          transform: `translate(${d(680, 14)}px, ${d(820, 14, 1)}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${14 + d(960, 3)}%`,
          height: 2,
          background: accent,
          opacity: 0.1,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${14 + d(900, 3, 1)}%`,
          height: 2,
          background: accent,
          opacity: 0.1,
        }}
      />
    </AbsoluteFill>
  );
};

/* ---------------- post body with optional highlighted span ---------------- */

const Body: React.FC<{
  text: string;
  span: [number, number] | null;
  ink: string;
  accent: string;
  fontSize: number;
  // 0..1 — drives the highlight wipe-in.
  wipe: number;
}> = ({ text, span, ink, accent, fontSize, wipe }) => {
  const base: React.CSSProperties = {
    margin: 0,
    color: ink,
    fontFamily: poppins,
    fontWeight: 500,
    fontSize,
    lineHeight: 1.42,
    letterSpacing: "-0.01em",
  };

  if (!span) {
    return <p style={base}>{text}</p>;
  }

  const [s, e] = span;
  const before = text.slice(0, s);
  const mid = text.slice(s, e);
  const after = text.slice(e);

  // Soft accent background that wipes in left->right, plus an accent underline.
  const wipePct = Math.round(wipe * 100);
  return (
    <p style={base}>
      {before}
      <span
        style={{
          position: "relative",
          color: ink,
          fontWeight: 700,
          padding: "0 2px",
          borderRadius: 3,
          backgroundImage: `linear-gradient(${accent}, ${accent})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${wipePct}% 100%`,
          backgroundPosition: "left center",
          // keep multi-line highlight contiguous
          WebkitBoxDecorationBreak: "clone",
          boxDecorationBreak: "clone",
          boxShadow: `inset 0 -3px 0 0 ${accent}`,
        }}
      >
        {mid}
      </span>
      {after}
    </p>
  );
};

/* ---------------- the persistent post card ---------------- */

const PostCard: React.FC<{
  post: Post;
  profile: StyleProfile;
  span: [number, number] | null;
  wipe: number;
  reveal: number; // 0..1 entry reveal of the whole card
}> = ({ post, profile, span, wipe, reveal }) => {
  const surface = profile.color.surface ?? "#FFFFFF";
  const ink = profile.color.ink ?? profile.color.primary ?? "#111111";
  const accent =
    profile.color.caption_highlight ??
    profile.color.accent?.[0] ??
    profile.color.primary ??
    "#C0392B";
  const muted = `${ink}99`; // ~60% alpha
  const sizes = profile.typography.size_scale;
  const bodySize = sizes?.body ?? 44;
  const glyph = platformGlyph(post.platform);

  return (
    <div
      style={{
        width: "100%",
        background: surface,
        borderRadius: 28,
        border: `1px solid ${ink}14`,
        padding: "44px 44px 36px",
        fontFamily: poppins,
        opacity: reveal,
        transform: `translateY(${interpolate(reveal, [0, 1], [40, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 30,
      }}
    >
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: profile.color.surface ?? "#FFFFFF",
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "0.02em",
          }}
        >
          {post.avatar ? (
            <Img
              src={staticFile(post.avatar)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            initials(post.author)
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: Math.round(bodySize * 0.82),
              color: ink,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {post.author}
          </div>
          {post.handle ? (
            <div
              style={{
                marginTop: 4,
                fontWeight: 500,
                fontSize: Math.round(bodySize * 0.6),
                color: muted,
              }}
            >
              {post.handle}
            </div>
          ) : null}
        </div>
        {glyph ? (
          <div
            style={{
              flexShrink: 0,
              fontWeight: 700,
              fontSize: Math.round(bodySize * 0.84),
              color: muted,
              lineHeight: 1,
            }}
          >
            {glyph}
          </div>
        ) : null}
      </div>

      {/* body */}
      <Body
        text={post.text ?? ""}
        span={span}
        ink={ink}
        accent={accent}
        fontSize={bodySize}
        wipe={wipe}
      />

      {/* footer */}
      {post.metric ? (
        <div
          style={{
            borderTop: `1px solid ${ink}14`,
            paddingTop: 22,
            fontWeight: 500,
            fontSize: Math.round((sizes?.caption ?? 30) * 0.95),
            color: muted,
            letterSpacing: "0.01em",
          }}
        >
          {post.metric}
        </div>
      ) : null}
    </div>
  );
};

/* ---------------- kinetic caption (operator commentary) below the card ------ */

const Caption: React.FC<{
  text: string;
  profile: StyleProfile;
  durationInFrames: number;
}> = ({ text, profile, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = {
    stiffness: profile.motion?.spring_params?.stiffness ?? 130,
    damping: profile.motion?.spring_params?.damping ?? 16,
  };
  const accent =
    profile.color.caption_highlight ??
    profile.color.accent?.[0] ??
    profile.color.primary ??
    "#C0392B";
  const ink = profile.color.ink ?? profile.color.text_on_bg ?? "#111111";
  const size = Math.round((profile.typography.size_scale?.caption ?? 30) * 1.18);

  const words = applyCase(text, profile.typography?.case).split(/\s+/);
  const exit = interpolate(
    frame,
    [durationInFrames - 6, durationInFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        marginTop: 44,
        textAlign: "center",
        maxWidth: "92%",
        opacity: 1 - exit,
        transform: `translateY(${exit * -18}px)`,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 56,
          height: 5,
          background: accent,
          marginBottom: 22,
          borderRadius: 3,
        }}
      />
      <div style={{ lineHeight: 1.18 }}>
        {words.map((w, i) => {
          const s = spring({ frame: frame - i * 2, fps, config: cfg });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.26em",
                fontFamily: poppins,
                fontWeight: 700,
                fontSize: size,
                color: i === 0 ? accent : ink,
                transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
                opacity: interpolate(s, [0, 1], [0, 1]),
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- per-beat overlay (highlight wipe + caption) ---------------- */

const Beat: React.FC<{
  post: Post;
  beat: HighlightBeat;
  profile: StyleProfile;
  durationInFrames: number;
}> = ({ post, beat, profile, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const span = findSpan(post.text ?? "", beat.highlight);

  // highlight wipes in just after the beat starts
  const wipe = span
    ? spring({
        frame: frame - 2,
        fps,
        config: { stiffness: 80, damping: 18 },
        durationInFrames: 16,
      })
    : 0;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: "0 70px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 920 }}>
        {/* card is fully revealed during active beats */}
        <PostCard
          post={post}
          profile={profile}
          span={span}
          wipe={wipe}
          reveal={1}
        />
        {beat.caption ? (
          <Caption
            text={beat.caption}
            profile={profile}
            durationInFrames={durationInFrames}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- first-beat reveal of the bare card ---------------- */

const RevealBeat: React.FC<{
  post: Post;
  beat: HighlightBeat;
  profile: StyleProfile;
  durationInFrames: number;
}> = ({ post, beat, profile, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({
    frame,
    fps,
    config: {
      stiffness: profile.motion?.spring_params?.stiffness ?? 130,
      damping: profile.motion?.spring_params?.damping ?? 16,
    },
    durationInFrames: 18,
  });
  // a beat-0 may still carry a highlight; honour it.
  const span = findSpan(post.text ?? "", beat.highlight);
  const wipe = span
    ? spring({ frame: frame - 4, fps, config: { stiffness: 80, damping: 18 }, durationInFrames: 16 })
    : 0;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: "0 70px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 920 }}>
        <PostCard
          post={post}
          profile={profile}
          span={span}
          wipe={wipe}
          reveal={reveal}
        />
        {beat.caption ? (
          <Caption
            text={beat.caption}
            profile={profile}
            durationInFrames={durationInFrames}
          />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/* ---------------- progress bar ---------------- */

const ProgressBar: React.FC<{ profile: StyleProfile }> = ({ profile }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const accent =
    profile.color.accent?.[0] ?? profile.color.primary ?? "#000000";
  const ink = profile.color.ink ?? profile.color.text_on_bg ?? "#111111";
  const pct = interpolate(frame, [0, durationInFrames - 1], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        left: 80,
        width: width - 160,
        height: 5,
        borderRadius: 3,
        background: `${ink}1F`,
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: `${pct * 100}%`,
          height: "100%",
          borderRadius: 3,
          background: accent,
        }}
      />
    </div>
  );
};

/* ---------------- composition ---------------- */

export const PostHighlightReel: React.FC<PostHighlightProps> = ({
  profile,
  post,
  blocks,
  fps,
}) => {
  const beats: HighlightBeat[] = blocks && blocks.length > 0 ? blocks : [{}];
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: profile.color.background }}>
      <EditorialBG profile={profile} />
      {beats.map((beat, i) => {
        const dur = framesFor(beat.duration_ms, profile, fps);
        const seq = (
          <Sequence
            key={i}
            from={offset}
            durationInFrames={dur}
            name={`beat-${i}${beat.highlight ? "-hi" : ""}`}
          >
            {i === 0 ? (
              <RevealBeat
                post={post}
                beat={beat}
                profile={profile}
                durationInFrames={dur}
              />
            ) : (
              <Beat
                post={post}
                beat={beat}
                profile={profile}
                durationInFrames={dur}
              />
            )}
          </Sequence>
        );
        offset += dur;
        return seq;
      })}
      <ProgressBar profile={profile} />
    </AbsoluteFill>
  );
};
