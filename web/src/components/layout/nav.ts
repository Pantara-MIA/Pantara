export interface NavItem {
  to: string;
  label: string;
}

/** Public navigation. Routes are added here as each phase ships its page. */
export const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Beranda' },
  { to: '/rapor-daerah', label: 'Rapor Daerah' },
  { to: '/intervensi', label: 'Intervensi' },
  { to: '/ensiklopedia', label: 'Ensiklopedia' },
  { to: '/simulator', label: 'Simulator' },
  { to: '/metodologi', label: 'Metodologi' },
];

/** Government workspace navigation. */
export const GOVERNMENT_NAV: NavItem[] = [
  { to: '/pemerintah', label: 'Dashboard' },
  { to: '/rapor-daerah', label: 'Rapor Daerah' },
  { to: '/intervensi', label: 'Intervensi Publik' },
  { to: '/metodologi', label: 'Metodologi' },
];

/** MSME workspace navigation. */
export const MSME_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/ensiklopedia', label: 'Ensiklopedia' },
  { to: '/rapor-daerah', label: 'Rapor Daerah' },
  { to: '/metodologi', label: 'Metodologi' },
];

/**
 * Navigation for a signed-in account, so the public pages it links to keep the
 * workspace header instead of dropping the user back to the visitor site.
 */
export const workspaceNav = (role?: string): NavItem[] => (role === 'government' ? GOVERNMENT_NAV : MSME_NAV);
