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
