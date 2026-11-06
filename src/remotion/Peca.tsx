import React from "react";
import {
  AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";

export type PecaProps = {
  largura: number;
  altura: number;
  titulo: string;
  subtitulo: string;
  cta: string;
  marca: string;
  corPrimaria: string;
  corSecundaria: string;
  corFundo: string;
  fonte: string;
  imagem: string | null;
  layout: "centro" | "esquerda" | "base";
};

export const pecaPadrao: PecaProps = {
  largura: 1080,
  altura: 1350,
  titulo: "Sua chamada principal aqui",
  subtitulo: "Uma frase de apoio curta e direta.",
  cta: "Saiba mais",
  marca: "Spec",
  corPrimaria: "#00F28A",
  corSecundaria: "#FFFFFF",
  corFundo: "#222222",
  fonte: "Ubuntu",
  imagem: null,
  layout: "centro",
};

export const calcularPeca: CalculateMetadataFunction<PecaProps> = ({ props }) => ({
  width: props.largura,
  height: props.altura,
});

export const Peca: React.FC<PecaProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 100; // 1% do lado menor
  const entra = (atraso: number) => spring({ frame: frame - atraso, fps, config: { damping: 14, mass: 0.7 } });
  const desloc = (atraso: number) => interpolate(entra(atraso), [0, 1], [6 * u, 0]);
  const centro = p.layout === "centro";
  const horizontal = width > height;

  return (
    <AbsoluteFill style={{ backgroundColor: p.corFundo, fontFamily: `"${p.fonte}", Ubuntu, Arial, sans-serif`, color: p.corSecundaria }}>
      {p.imagem ? (
        <>
          <Img src={staticFile(p.imagem)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${interpolate(frame, [0, 90], [1.08, 1])})` }} />
          <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 100%)` }} />
        </>
      ) : (
        <AbsoluteFill>
          {/* elemento gráfico: barras na cor primária */}
          <div style={{ position: "absolute", right: -12 * u, top: -12 * u, width: 50 * u, height: 50 * u, borderRadius: 10 * u, border: `${1.6 * u}px solid ${p.corPrimaria}`, opacity: 0.35, transform: `rotate(${interpolate(frame, [0, 90], [8, 18])}deg)` }} />
          <div style={{ position: "absolute", left: -8 * u, bottom: -8 * u, width: 30 * u, height: 30 * u, borderRadius: 7 * u, background: p.corPrimaria, opacity: 0.18, transform: `rotate(${interpolate(frame, [0, 90], [-12, -4])}deg)` }} />
        </AbsoluteFill>
      )}

      <div style={{ position: "absolute", top: 7 * u, left: 8 * u, right: 8 * u, display: "flex", alignItems: "center", gap: 2 * u, opacity: entra(0) }}>
        <div style={{ width: 3.2 * u, height: 3.2 * u, borderRadius: 0.8 * u, background: p.corPrimaria }} />
        <span style={{ fontSize: 3.6 * u, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: p.imagem ? "#fff" : p.corPrimaria }}>{p.marca}</span>
      </div>

      <AbsoluteFill
        style={{
          padding: `${16 * u}px ${8 * u}px ${12 * u}px`,
          justifyContent: p.layout === "base" ? "flex-end" : "center",
          alignItems: centro ? "center" : "flex-start",
          textAlign: centro ? "center" : "left",
          gap: 3.4 * u,
        }}
      >
        <div style={{ width: 14 * u, height: 1.2 * u, borderRadius: u, background: p.corPrimaria, transform: `scaleX(${entra(4)})`, transformOrigin: centro ? "center" : "left" }} />
        <h1 style={{ margin: 0, fontWeight: 700, lineHeight: 1.04, fontSize: (horizontal ? 9 : 10) * u, maxWidth: horizontal ? "75%" : "100%", opacity: entra(6), transform: `translateY(${desloc(6)}px)` }}>
          {p.titulo}
        </h1>
        {p.subtitulo ? (
          <p style={{ margin: 0, fontSize: 4.4 * u, lineHeight: 1.35, opacity: 0.92 * entra(12), maxWidth: horizontal ? "65%" : "92%", transform: `translateY(${desloc(12)}px)` }}>
            {p.subtitulo}
          </p>
        ) : null}
        {p.cta ? (
          <div style={{ marginTop: 2 * u, background: p.corPrimaria, color: p.corFundo, fontWeight: 700, fontSize: 4 * u, padding: `${2.6 * u}px ${5.4 * u}px`, borderRadius: 99 * u, transform: `scale(${entra(18)})` }}>
            {p.cta}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
