// Formatos de entrega por plataforma.
export const FORMATOS_VIDEO = {
  meta_reels: { nome: "Meta Ads — Reels/Stories 9:16", w: 1080, h: 1920 },
  meta_feed: { nome: "Meta Ads — Feed 4:5", w: 1080, h: 1350 },
  meta_quadrado: { nome: "Meta Ads — Quadrado 1:1", w: 1080, h: 1080 },
  youtube: { nome: "YouTube 16:9 (1080p)", w: 1920, h: 1080 },
  youtube_4k: { nome: "YouTube 16:9 (4K)", w: 3840, h: 2160 },
  shorts: { nome: "YouTube Shorts / TikTok 9:16", w: 1080, h: 1920 },
  linkedin: { nome: "LinkedIn 16:9", w: 1920, h: 1080 },
};

export const FORMATOS_GRAFICO = {
  post_quadrado: { nome: "Post 1:1 (1080x1080)", w: 1080, h: 1080 },
  post_feed: { nome: "Feed 4:5 (1080x1350)", w: 1080, h: 1350 },
  story: { nome: "Story/Reels 9:16 (1080x1920)", w: 1080, h: 1920 },
  thumb_youtube: { nome: "Thumbnail YouTube (1280x720)", w: 1280, h: 720 },
  banner_16x9: { nome: "Banner 16:9 (1920x1080)", w: 1920, h: 1080 },
  carrossel: { nome: "Carrossel 4:5 (1080x1350)", w: 1080, h: 1350 },
};

export const MODELOS_WHISPER = ["tiny", "base", "small", "medium", "large-v3"];
