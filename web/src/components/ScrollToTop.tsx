import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Mengembalikan posisi scroll ke atas setiap pindah halaman.
 *
 * `scroll-behavior: smooth` di CSS global membuat navigasi antar halaman terasa
 * "meluncur" dari posisi lama, jadi lompatannya dipaksa instan di sini.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
}
