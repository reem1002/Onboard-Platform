import { useT } from '../lib/i18n';
/**
 * Turn a video link into something safe to embed.
 * Only known providers become iframes (with a URL we build from the parsed id —
 * the raw link is never used as an iframe src). Direct media files use <video>.
 */
const ID = /^[A-Za-z0-9_-]{4,64}$/;

export function parseVideo(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { type: 'invalid' };
  }
  if (u.protocol !== 'https:') return { type: 'invalid' };
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const seg = u.pathname.split('/').filter(Boolean);

  let id;
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(seg[0]) ? seg[1] : null);
    if (id && ID.test(id)) return { type: 'iframe', provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }
  if (host === 'youtu.be' && ID.test(seg[0] || '')) return { type: 'iframe', provider: 'YouTube', src: `https://www.youtube-nocookie.com/embed/${seg[0]}?rel=0` };
  if (host === 'vimeo.com' && /^\d+$/.test(seg[0] || '')) return { type: 'iframe', provider: 'Vimeo', src: `https://player.vimeo.com/video/${seg[0]}` };
  if (host === 'player.vimeo.com' && seg[0] === 'video' && /^\d+$/.test(seg[1] || '')) return { type: 'iframe', provider: 'Vimeo', src: `https://player.vimeo.com/video/${seg[1]}` };
  if (host === 'loom.com' && ['share', 'embed'].includes(seg[0]) && ID.test(seg[1] || '')) return { type: 'iframe', provider: 'Loom', src: `https://www.loom.com/embed/${seg[1]}` };
  if (host === 'drive.google.com' && seg[0] === 'file' && seg[1] === 'd' && ID.test(seg[2] || '')) {
    return { type: 'iframe', provider: 'Google Drive', src: `https://drive.google.com/file/d/${seg[2]}/preview` };
  }
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { type: 'video', provider: 'Video file', src: u.href };
  return { type: 'link', provider: host, src: u.href };
}

export function VideoEmbed({ video }) {
  const t = useT();
  const v = parseVideo(video.url);
  return (
    <figure className="video">
      {v.type === 'iframe' && (
        <div className="video-frame">
          <iframe
            src={v.src}
            title={video.title || `${v.provider} video`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        </div>
      )}
      {v.type === 'video' && (
        <div className="video-frame">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={v.src} controls preload="metadata" />
        </div>
      )}
      {v.type === 'link' && (
        <a className="file-link" href={v.src} target="_blank" rel="noopener noreferrer"><span>Open video on {v.provider} ↗</span></a>
      )}
      {v.type === 'invalid' && <p className="small muted">{t('This video link isn’t valid.')}</p>}
      {(video.title || video.note) && (
        <figcaption>
          {video.title && <strong>{video.title}</strong>}
          {video.note && <span className="small muted">{video.note}</span>}
        </figcaption>
      )}
    </figure>
  );
}
