import { z } from "zod";

/**
 * StyleProfile — Riff's center-of-gravity asset (see mise/spec.md §10).
 * Shared across every template; each template reads the slice of it it needs.
 * Keep in sync with core/schema as the schema evolves.
 */
export const styleProfile = z.object({
  schema_version: z.string(),
  typography: z.object({
    primary_font: z.string(),
    case: z.enum(["upper", "title", "mixed"]),
    size_scale: z.object({
      headline: z.number(),
      body: z.number(),
      caption: z.number(),
    }),
  }),
  color: z.object({
    background: z.string(),
    primary: z.string(),
    accent: z.array(z.string()),
    text_on_bg: z.string(),
    // Optional extras for templates with a graphic surface + captions.
    surface: z.string().optional(), // graphic-card background (e.g. cream)
    ink: z.string().optional(), // text on the graphic surface
    caption_highlight: z.string().optional(), // karaoke keyword colour
  }),
  motion: z.object({
    transition_style: z.enum(["cut", "fade", "slide", "kinetic"]),
    easing: z.enum(["linear", "ease-in-out", "spring"]),
    spring_params: z.object({ stiffness: z.number(), damping: z.number() }),
    default_in_ms: z.number(),
  }),
  layout: z.object({
    aspect: z.string(),
    grid: z.enum(["centered", "rule-of-thirds", "left-aligned"]),
    text_position: z.enum(["center", "lower-third", "top"]),
    // Newer, optional fields — older profiles (centered template) omit these.
    archetype: z.enum(["centered", "split_explainer"]).default("centered"),
    face: z
      .object({
        position: z.enum(["bottom", "right"]),
        height_pct: z.number(),
      })
      .optional(),
  }),
  pacing: z.object({
    avg_segment_ms: z.number(),
  }),
});

/** Frames a beat occupies, given its own duration or the profile pacing default. */
export const framesFor = (
  durationMs: number | undefined,
  profile: StyleProfile,
  fps: number,
): number =>
  Math.round(((durationMs ?? profile.pacing.avg_segment_ms) / 1000) * fps);

/* ---- Centered typography template (InfographicReel) ---- */

export const contentBlock = z.object({
  text: z.string(),
  emphasis: z.boolean(),
  duration_ms: z.number().optional(),
});

export const reelProps = z.object({
  profile: styleProfile,
  blocks: z.array(contentBlock),
  fps: z.number(),
});

export const blockFrames = (
  block: ContentBlock,
  profile: StyleProfile,
  fps: number,
): number => framesFor(block.duration_ms, profile, fps);

/* ---- 50/50 split explainer template (SplitExplainerReel) ---- */

export const slide = z.object({
  kicker: z.string().optional(),
  headline: z.string(),
  bullets: z.array(z.string()).optional(),
  stat: z.object({ value: z.string(), label: z.string() }).optional(),
  // Ephemeral public path populated only from the selected merchant asset set.
  media: z.string().optional(),
  // Editorial colour palette for this beat: paper | ink | forest | slate.
  palette: z.enum(["paper", "ink", "forest", "slate"]).optional(),
  // The shot type — the editorial layout for this beat.
  shot: z
    .enum([
      "title",
      "speaker_full",
      "speaker_circle",
      "split",
      "broll_full",
      "chart_bars",
      "list_detail",
      "stat_detail",
    ])
    .optional(),
  // Richer infographic data
  bars: z
    .array(z.object({ label: z.string(), value: z.string(), pct: z.number() }))
    .optional(),
  items: z.array(z.object({ title: z.string(), desc: z.string() })).optional(),
  substats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});

export const explainerBlock = z.object({
  spoken: z.string(), // the talking-head line; also drives the caption
  slide: slide, // what fills the top (infographic) region
  emphasis: z.boolean().default(false),
  duration_ms: z.number().optional(),
});

export const explainerProps = z.object({
  profile: styleProfile,
  speaker: z.object({ name: z.string(), handle: z.string() }),
  blocks: z.array(explainerBlock),
  fps: z.number(),
});

/* ---- Standard template: TalkingHalf (persistent 50/50 talking-head split) ---- */

export const talkingVisual = z.object({
  kind: z.enum(["title", "stat", "bullets", "broll"]),
  kicker: z.string().optional(),
  headline: z.string().optional(),
  stat: z.object({ value: z.string(), label: z.string() }).optional(),
  bullets: z.array(z.string()).optional(),
  media: z.string().optional(), // ephemeral selected merchant asset path
});

export const talkingHalfBlock = z.object({
  spoken: z.string(), // talking-head line; also drives the caption at the seam
  visual: talkingVisual, // fills the top half
  duration_ms: z.number().optional(),
});

export const talkingHalfProps = z.object({
  profile: styleProfile,
  speaker: z.object({ name: z.string(), handle: z.string() }),
  blocks: z.array(talkingHalfBlock),
  fps: z.number(),
});

/* ---- Standard template: FullInfographic (full-screen infographic deck) ---- */

export const infoBlock = z.object({
  kind: z.enum(["title", "stat", "bars", "list", "quote"]),
  kicker: z.string().optional(),
  title: z.string().optional(),
  stat: z.object({ value: z.string(), label: z.string() }).optional(),
  bars: z
    .array(z.object({ label: z.string(), value: z.string(), pct: z.number() }))
    .optional(),
  items: z.array(z.object({ title: z.string(), desc: z.string() })).optional(),
  quote: z.string().optional(),
  attribution: z.string().optional(),
  caption: z.string().optional(), // optional lower caption
  duration_ms: z.number().optional(),
});

export const fullInfographicProps = z.object({
  profile: styleProfile,
  blocks: z.array(infoBlock),
  fps: z.number(),
});

/* ---- Standard template: PostHighlight (show a social post + highlight text) ---- */

export const post = z.object({
  author: z.string(),
  handle: z.string(),
  text: z.string(),
  avatar: z.string().optional(), // staticFile key in public/
  platform: z.string().optional(), // e.g. "x", "instagram", "linkedin"
  metric: z.string().optional(), // e.g. "2.4M views"
});

export const highlightBeat = z.object({
  highlight: z.string().optional(), // a phrase within post.text to emphasise this beat
  caption: z.string().optional(), // operator commentary shown under the post
  duration_ms: z.number().optional(),
});

export const postHighlightProps = z.object({
  profile: styleProfile,
  post: post,
  blocks: z.array(highlightBeat),
  fps: z.number(),
});

export type StyleProfile = z.infer<typeof styleProfile>;
export type ContentBlock = z.infer<typeof contentBlock>;
export type ReelProps = z.infer<typeof reelProps>;
export type Slide = z.infer<typeof slide>;
export type ExplainerBlock = z.infer<typeof explainerBlock>;
export type ExplainerProps = z.infer<typeof explainerProps>;
export type TalkingVisual = z.infer<typeof talkingVisual>;
export type TalkingHalfBlock = z.infer<typeof talkingHalfBlock>;
export type TalkingHalfProps = z.infer<typeof talkingHalfProps>;
export type InfoBlock = z.infer<typeof infoBlock>;
export type FullInfographicProps = z.infer<typeof fullInfographicProps>;
export type Post = z.infer<typeof post>;
export type HighlightBeat = z.infer<typeof highlightBeat>;
export type PostHighlightProps = z.infer<typeof postHighlightProps>;
