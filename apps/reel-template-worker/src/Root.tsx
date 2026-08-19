import React from "react";
import { Composition } from "remotion";

import { FullInfographicReel } from "./FullInfographicReel";
import { InfographicReel } from "./InfographicReel";
import { PostHighlightReel } from "./PostHighlightReel";
import { SplitExplainerReel } from "./SplitExplainerReel";
import { TalkingHalfReel } from "./TalkingHalfReel";
import { explainerDefaults, fullInfographicDefaults, infographicDefaults, postHighlightDefaults, talkingHalfDefaults } from "./defaults";
import { blockFrames, explainerProps, framesFor, fullInfographicProps, postHighlightProps, reelProps, talkingHalfProps } from "./schema";

export const REEL_FRAME = { fps: 30, width: 1080, height: 1920 } as const;

const sumFrames = (blocks: { duration_ms?: number }[], profile: Parameters<typeof framesFor>[1], fps: number): number =>
  Math.max(blocks.reduce((total, block) => total + framesFor(block.duration_ms, profile, fps), 0), 1);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="InfographicReel" component={InfographicReel} schema={reelProps} defaultProps={infographicDefaults} {...REEL_FRAME} durationInFrames={450} calculateMetadata={({ props }) => ({ ...REEL_FRAME, durationInFrames: Math.max(props.blocks.reduce((total, block) => total + blockFrames(block, props.profile, props.fps), 0), 1) })} />
    <Composition id="SplitExplainerReel" component={SplitExplainerReel} schema={explainerProps} defaultProps={explainerDefaults} {...REEL_FRAME} durationInFrames={450} calculateMetadata={({ props }) => ({ ...REEL_FRAME, fps: props.fps, durationInFrames: sumFrames(props.blocks, props.profile, props.fps) })} />
    <Composition id="TalkingHalfReel" component={TalkingHalfReel} schema={talkingHalfProps} defaultProps={talkingHalfDefaults} {...REEL_FRAME} durationInFrames={450} calculateMetadata={({ props }) => ({ ...REEL_FRAME, fps: props.fps, durationInFrames: sumFrames(props.blocks, props.profile, props.fps) })} />
    <Composition id="FullInfographicReel" component={FullInfographicReel} schema={fullInfographicProps} defaultProps={fullInfographicDefaults} {...REEL_FRAME} durationInFrames={450} calculateMetadata={({ props }) => ({ ...REEL_FRAME, fps: props.fps, durationInFrames: sumFrames(props.blocks, props.profile, props.fps) })} />
    <Composition id="PostHighlightReel" component={PostHighlightReel} schema={postHighlightProps} defaultProps={postHighlightDefaults} {...REEL_FRAME} durationInFrames={450} calculateMetadata={({ props }) => ({ ...REEL_FRAME, fps: props.fps, durationInFrames: sumFrames(props.blocks, props.profile, props.fps) })} />
  </>
);
