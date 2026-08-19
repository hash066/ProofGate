import type {
  ExplainerProps,
  FullInfographicProps,
  PostHighlightProps,
  ReelProps,
  StyleProfile,
  TalkingHalfProps,
} from "./schema";

export const defaultStyleProfile: StyleProfile = {
  schema_version: "axcas-1",
  typography: { primary_font: "Poppins", case: "mixed", size_scale: { headline: 80, body: 46, caption: 30 } },
  color: { background: "#171717", primary: "#f4f1eb", accent: ["#fe5b3a"], text_on_bg: "#f4f1eb", surface: "#ffffff", ink: "#171717", caption_highlight: "#fe5b3a" },
  motion: { transition_style: "kinetic", easing: "spring", spring_params: { stiffness: 130, damping: 16 }, default_in_ms: 320 },
  layout: { aspect: "9:16", grid: "left-aligned", text_position: "top", archetype: "centered" },
  pacing: { avg_segment_ms: 5_000 },
};

export const infographicDefaults: ReelProps = {
  profile: defaultStyleProfile,
  blocks: [
    { text: "Your real work", emphasis: false, duration_ms: 5_000 },
    { text: "Presented clearly", emphasis: true, duration_ms: 5_000 },
    { text: "Message to learn more", emphasis: false, duration_ms: 5_000 },
  ],
  fps: 30,
};

export const explainerDefaults: ExplainerProps = {
  profile: { ...defaultStyleProfile, layout: { ...defaultStyleProfile.layout, archetype: "split_explainer" } },
  speaker: { name: "Your business", handle: "" },
  blocks: infographicDefaults.blocks.map((block) => ({
    spoken: block.text,
    emphasis: block.emphasis,
    slide: { shot: "title", palette: "ink", headline: block.text },
    duration_ms: block.duration_ms,
  })),
  fps: 30,
};

export const talkingHalfDefaults: TalkingHalfProps = {
  profile: explainerDefaults.profile,
  speaker: explainerDefaults.speaker,
  blocks: infographicDefaults.blocks.map((block) => ({ spoken: block.text, visual: { kind: "title", headline: block.text }, duration_ms: block.duration_ms })),
  fps: 30,
};

export const fullInfographicDefaults: FullInfographicProps = {
  profile: defaultStyleProfile,
  blocks: infographicDefaults.blocks.map((block, index) => ({ kind: index === 0 ? "title" : "quote", title: block.text, quote: block.text, duration_ms: block.duration_ms })),
  fps: 30,
};

export const postHighlightDefaults: PostHighlightProps = {
  profile: defaultStyleProfile,
  post: { author: "Your business", handle: "", text: "Your real customer story" },
  blocks: [{ duration_ms: 5_000 }, { highlight: "real customer story", caption: "Show the proof", duration_ms: 5_000 }, { caption: "Message to learn more", duration_ms: 5_000 }],
  fps: 30,
};
