import { useEffect, useState } from 'react';

/** Remote media never leaves an unexplained blank space when absent, loading or unavailable. */
export function WikiPicture({ src, alt, className, play, onUnavailable }: { src?: string; alt: string; className: string; play?: boolean; onUnavailable?: () => void }) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(false); setLoaded(false); }, [src]);
  const video = !!src && /\.(webm|mp4)$/i.test(src);
  const message = broken ? 'Изображение недоступно' : !src ? 'Нет изображения' : 'Анимация';
  if (!src || broken || (video && !play)) return <span className={`${className} wiki__noimage wiki__picture`} role="img" aria-label={alt ? `${alt}: ${message}` : message}><span>{message}</span></span>;
  const failed = () => { setBroken(true); onUnavailable?.(); };
  if (video) return <video className={className} src={src} autoPlay loop muted playsInline aria-label={alt} onError={failed} />;
  return <span className={`${className} wiki__picture`}>
    {!loaded && <span className="wiki__picture-loading" aria-hidden="true">Загрузка изображения…</span>}
    <img src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={failed} />
  </span>;
}
