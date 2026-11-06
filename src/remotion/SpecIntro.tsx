import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const SpecIntro: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0f", justifyContent: "center", alignItems: "center", fontFamily: "sans-serif" }}>
      <div style={{ color: "white", fontSize: 180, fontWeight: 800, transform: `scale(${scale})` }}>{title}</div>
      <div style={{ color: "#9aa0ff", fontSize: 64, opacity }}>{subtitle}</div>
    </AbsoluteFill>
  );
};
