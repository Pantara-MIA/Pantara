import LogoMark from '../../assets/pantara-logo.png';

/**
 * Pantara logo with wordmark. `onDark` switches
 * the text for forest backgrounds and sets the logo on a cream disc, since its
 * dark leaves would sink into the background.
 */
export function BrandWordmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={LogoMark} alt="" className={`h-9 w-9 ${onDark ? 'rounded-full bg-gold-soft p-0.5' : ''}`} />
      <span className="flex flex-col leading-none">
        <span className={`font-display text-lg font-bold tracking-tight ${onDark ? 'text-white' : 'text-ink'}`}>Pantara</span>
        <span className={`mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase ${onDark ? 'text-mint' : 'text-ink-3'}`}>
          Pangan Terbuka dan Terarah
        </span>
      </span>
    </span>
  );
}
