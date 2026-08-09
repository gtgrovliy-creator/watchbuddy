import type { YouTubePlayer } from 'react-youtube';
import type { MutableRefObject } from 'react';

export interface VideoSource {
  type: 'youtube' | 'direct' | 'vk';
  url?: string;      // Прямая ссылка или URL VK
  videoId?: string;  // YouTube ID
  title: string;
  thumbnail?: string;
  channel?: string;
}

// Определение типа видео из ссылки
export function parseVideoUrl(input: string): VideoSource | null {
  const url = input.trim();
  if (!url) return null;

  // YouTube
  const youtubeMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (youtubeMatch) {
    return {
      type: 'youtube',
      videoId: youtubeMatch[1],
      title: 'YouTube Video',
      thumbnail: `https://img.youtube.com/vi/${youtubeMatch[1]}/mqdefault.jpg`,
      channel: 'YouTube',
    };
  }

  // VK Видео
  if (url.includes('vk.com/video') || url.includes('vkvideo.ru')) {
    // Пытаемся извлечь ID видео из URL
    const vkMatch = url.match(/(?:video|v=)(-?\d+)(?:_(\d+))?/);
    if (vkMatch) {
      const ownerId = vkMatch[1];
      const videoId = vkMatch[2];
      return {
        type: 'vk',
        url: url,
        title: 'VK Video',
        thumbnail: '',
        channel: 'VK',
        videoId: videoId ? `${ownerId}_${videoId}` : undefined,
      };
    }
    return {
      type: 'vk',
      url: url,
      title: 'VK Video',
      channel: 'VK',
    };
  }

  // Прямая ссылка на видеофайл (.mp4, .webm, .ogg, .m3u8)
  const isDirectVideo = /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)(\?.*)?$/i.test(url);
  if (isDirectVideo || (url.startsWith('http') && !url.includes('youtube.com') && !url.includes('youtu.be'))) {
    // Для m3u8 нужен HLS плеер, используем простой video player
    return {
      type: 'direct',
      url: url,
      title: extractTitleFromUrl(url),
      channel: extractDomain(url),
    };
  }

  return null;
}

// Извлечение названия из URL
function extractTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const last = pathParts[pathParts.length - 1] || parsed.hostname;
    return decodeURIComponent(last).replace(/\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)$/i, '').replace(/[-_]+/g, ' ') || 'Video';
  } catch {
    return 'Direct Video';
  }
}

// Извлечение домена из URL
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Direct Video';
  }
}

// Помощники для управления плеером
export function syncYouTubePlayer(
  player: YouTubePlayer | null,
  targetTime: number,
  isPlaying: boolean,
  isInternalChange: MutableRefObject<boolean>
) {
  if (!player) return;
  isInternalChange.current = true;

  const currentPos = player.getCurrentTime();
  if (Math.abs(currentPos - targetTime) > 2) {
    player.seekTo(targetTime, true);
  }

  if (isPlaying) player.playVideo();
  else player.pauseVideo();

  setTimeout(() => { isInternalChange.current = false }, 1000);
}

// Получение значения event для HTML5 video элемент
export function onHtml5VideoStateChange(
  video: HTMLVideoElement,
  onStateChange: (isPlaying: boolean, currentTime: number) => void
) {
  video.addEventListener('play', () => onStateChange(true, video.currentTime));
  video.addEventListener('pause', () => onStateChange(false, video.currentTime));
  video.addEventListener('seeked', () => onStateChange(!video.paused, video.currentTime));
}