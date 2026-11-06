import React from "react";
import { Composition } from "remotion";
import { SpecIntro } from "./SpecIntro";

export const Root: React.FC = () => (
  <>
    {/* Vertical 9:16 (Reels/TikTok/Shorts) */}
    <Composition
      id="SpecIntro"
      component={SpecIntro}
      durationInFrames={90}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ title: "Spec", subtitle: "Editor oficial" }}
    />
    {/* Horizontal 16:9 (YouTube) */}
    <Composition
      id="SpecIntroWide"
      component={SpecIntro}
      durationInFrames={90}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: "Spec", subtitle: "Editor oficial" }}
    />
  </>
);
