import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUp, FlaskConical, LogOut, Menu, X } from 'lucide-react';
import { BrandWordmark } from './BrandMark';
import { auth } from '../../lib/auth';
import { PUBLIC_NAV, workspaceNav } from './nav';
import type { NavItem } from './nav';
import { useScrollProgress, useSlidingIndicator } from '../motion/hooks';

function SyntheticDataBanner() {
  return (
    <div className="border-b border-gold/50 bg-gold-soft">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs text-gold-ink sm:px-6">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Versi demonstrasi: harga provinsi dari PIHPS dan kab/kota dari SP2KP; komoditas yang belum dipantau di suatu kab/kota masih{' '}
          <strong>data simulasi</strong> dan diberi tanda.
        </span>
      </p>
    </div>
  );
}

/** "Masuk" for visitors. */
function SignInLink() {
  return (
    <Link
      to="/login"
      className="btn btn-shine hidden rounded-full bg-gold px-4 py-2 text-sm font-bold text-[#3A3113] shadow-[0_12px_28px_-14px_rgba(211,190,109,0.95)] hover:shadow-[0_18px_34px_-14px_rgba(211,190,109,1)] hover:brightness-95 sm:inline-flex"
    >
      Masuk
    </Link>
  );
}

/** "Keluar" for signed-in users: clears the session and returns to the public home page. */
function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        auth.clearToken();
        navigate('/');
      }}
      className="hidden items-center gap-1.5 rounded-full border border-mint px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft sm:inline-flex"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" /> Keluar
    </button>
  );
}

function SiteHeaderCivic({ nav, actions, signedIn }: { nav: NavItem[]; actions?: ReactNode; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [navRef, pillStyle] = useSlidingIndicator<HTMLElement>('[aria-current="page"]', pathname);
  const [progressRef, scrolled] = useScrollProgress<HTMLSpanElement>();

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled
          ? 'border-mint/80 bg-[#F8FCF8]/95 shadow-[0_14px_34px_-20px_rgba(13,51,17,0.55)]'
          : 'border-mint/60 bg-[#F8FCF8]/90 shadow-[0_10px_30px_-22px_rgba(13,51,17,0.6)]'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to={signedIn ? auth.homeFor(auth.getRole()) : '/'}
          aria-label={signedIn ? 'Pantara — dashboard' : 'Pantara — beranda'}
          className="group transition-transform duration-300 hover:scale-[1.02]"
        >
          <BrandWordmark />
        </Link>
        <nav ref={navRef} aria-label="Navigasi utama" className="relative hidden items-center gap-1 md:flex">
          <span aria-hidden="true" className="slide-indicator rounded-full bg-accent shadow-[0_8px_20px_-10px_rgba(27,94,32,0.9)]" style={pillStyle} />
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative z-10 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${isActive ? 'text-white' : 'text-accent hover:bg-accent-soft'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {actions ?? (signedIn ? <SignOutButton /> : <SignInLink />)}
          <button
            type="button"
            className="btn grid h-10 w-10 place-items-center rounded-2xl border border-mint bg-white/80 text-accent md:hidden"
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`transition-transform duration-300 ${open ? 'rotate-90' : ''}`}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</span>
          </button>
        </div>
      </div>
      <div className="nw-collapse md:hidden" data-open={open} inert={!open}>
        <nav aria-label="Navigasi utama" className="space-y-1 border-t border-mint/50 px-4 py-3">
          {nav.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `block rounded-full px-4 py-2 text-sm font-semibold transition-[background-color,color,transform,opacity] duration-300 ${
                  isActive ? 'bg-accent text-white' : 'text-accent hover:bg-accent-soft'
                } ${open ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`
              }
              style={{ transitionDelay: open ? `${i * 35}ms` : '0ms' }}
              onClick={() => setOpen(false)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
        <span ref={progressRef} className="scroll-progress block h-full bg-linear-to-r from-leaf via-gold to-gold" />
      </span>
    </header>
  );
}

/** Floating shortcut back to the top once the reader is deep into a page. */
function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Kembali ke atas"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      className={`btn fixed right-5 bottom-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow-[0_16px_34px_-14px_rgba(13,51,17,0.9)] hover:bg-accent-strong ${
        show ? 'pointer-events-auto opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      style={{ transition: 'opacity 0.3s ease, translate 0.4s var(--ease-out-soft), transform 0.2s var(--ease-out-soft), background-color 0.2s ease' }}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

function SiteFooterCivic() {
  return (
    <footer className="bg-[#0D3311] text-[#C8E6C9]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <BrandWordmark onDark />
          <p className="mt-3 max-w-xs text-xs text-[#8FBF8F]">
            Transparansi harga pangan dan pendukung keputusan berbasis data untuk publik, pemerintah daerah, dan UMKM.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-gold uppercase">Sumber data</p>
          <ul className="mt-3 space-y-1.5 text-xs">
            <li>Harga pangan: PIHPS Bank Indonesia (provinsi) · SP2KP Kemendag (kab/kota)</li>
            <li>Cuaca: Open-Meteo (ERA5) · El Niño/La Niña: NOAA CPC (RONI)</li>
            <li>Bobot inflasi: BPS</li>
            <li>Harga acuan: HET/HAP Bapanas &amp; Kemendag (indikatif)</li>
            <li>Batas provinsi: geoBoundaries, © kontributor OpenStreetMap (ODbL)</li>
            <li>Batas kab/kota: BPS via geoBoundaries (CC BY 3.0 IGO)</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-gold uppercase">Metode terbuka</p>
          <p className="mt-3 text-xs">
            Seluruh rumus skor, prakiraan, dan rekomendasi dijelaskan di halaman{' '}
            <Link to="/metodologi" className="font-semibold text-white underline underline-offset-2">
              Metodologi
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * Page frame of the civic design system: banner, header, content, footer.
 * Signed-in users keep their workspace navigation on every page, public ones
 * included; visitors get the public navigation.
 */
export function SiteShell({
  children,
  nav,
  headerActions,
  fullBleed = false,
}: {
  children: ReactNode;
  nav?: NavItem[];
  headerActions?: ReactNode;
  /** Render children edge to edge (pages that manage their own sections). */
  fullBleed?: boolean;
}) {
  const signedIn = auth.isAuthenticated();
  const items = nav ?? (signedIn ? workspaceNav(auth.getRole()) : PUBLIC_NAV);
  return (
    <div className="civic flex min-h-screen flex-col">
      <a href="#konten" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
        Lewati ke konten
      </a>
      <SyntheticDataBanner />
      <SiteHeaderCivic nav={items} actions={headerActions} signedIn={signedIn} />
      <main id="konten" className={`page-enter ${fullBleed ? 'w-full flex-1' : 'mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8'}`}>
        {children}
      </main>
      <div className={fullBleed ? '' : 'mt-16'} />
      <SiteFooterCivic />
      <BackToTop />
    </div>
  );
}

/** Title block at the top of a page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="anim-rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-xs font-bold tracking-[0.16em] text-ink-3 uppercase">{eyebrow}</p>}
        <h1 className="mt-1.5 font-display text-3xl leading-tight font-bold text-ink sm:text-4xl">{title}</h1>
        <span aria-hidden="true" className="anim-grow-x mt-3 block h-1 w-14 rounded-full bg-linear-to-r from-gold to-leaf" />
        {description && <p className="mt-3 text-sm text-ink-2 sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-3">{actions}</div>}
    </div>
  );
}
