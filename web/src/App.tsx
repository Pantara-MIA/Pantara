import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import ScrollToTop from './components/ScrollToTop';
import { installSpotlight } from './components/motion/spotlight';
import LogoMark from './assets/pantara-logo.png';

// Every page except the home page loads on demand, so visitors only download
// the dashboards they actually open.
const Encyclopedia = lazy(() => import('./pages/Encyclopedia'));
const Simulator = lazy(() => import('./pages/Simulator'));
const Methodology = lazy(() => import('./pages/Methodology'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const MsmeDashboard = lazy(() => import('./pages/msme/MsmeDashboard'));
const ScorecardOverview = lazy(() => import('./pages/regional/ScorecardOverview'));
const RegionReport = lazy(() => import('./pages/regional/RegionReport'));
const InterventionsFeed = lazy(() => import('./pages/regional/InterventionsFeed'));
const GovernmentDashboard = lazy(() => import('./pages/government/GovernmentDashboard'));

// Developer-only design-system gallery; excluded from production bundles.
const ComponentCatalog = import.meta.env.DEV ? lazy(() => import('./pages/ComponentCatalog')) : null;

/** Page-coloured frame with a loading bar while a route chunk loads. */
function RouteFallback() {
  return (
    <div className="civic grid min-h-screen place-items-center" aria-busy="true" aria-label="Memuat halaman">
      <span className="fixed inset-x-0 top-0 h-0.5 overflow-hidden bg-mint/40" aria-hidden="true">
        <span className="route-bar block h-full w-full bg-linear-to-r from-leaf to-gold" />
      </span>
      <img src={LogoMark} alt="" className="anim-float h-12 w-12 opacity-60" />
    </div>
  );
}

export default function App() {
  useEffect(() => installSpotlight(), []);
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/ensiklopedia" element={<Encyclopedia />} />
          <Route path="/simulator" element={<Simulator />} />
          <Route path="/metodologi" element={<Methodology />} />
          <Route path="/login" element={<Onboarding />} />
          <Route path="/dashboard" element={<MsmeDashboard />} />
          <Route path="/rapor-daerah" element={<ScorecardOverview />} />
          <Route path="/rapor-daerah/:regionId" element={<RegionReport />} />
          <Route path="/intervensi" element={<InterventionsFeed />} />
          <Route path="/pemerintah" element={<GovernmentDashboard />} />
          {ComponentCatalog && <Route path="/katalog-komponen" element={<ComponentCatalog />} />}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
