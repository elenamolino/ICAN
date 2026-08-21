import { Helmet } from 'react-helmet-async';
import { useRouter } from '../../../core/hooks/useRouter';
import BackgroundOrbs from './components/background-orbs';
import FloatingMorphHeader from './components/floating-morph-header';
import FullFooterSection from './components/full-footer-section';
import HeroSection from './components/hero-section';
import HomeGlobalStyles from './components/home-global-styles';
import FundersSection from './components/funders-section';
import { FUNDERS, NAV_ITEMS } from './data';

export default function HomePage() {
  const router = useRouter();

  const handleNavigate = (to: string) => router.push(to);

  return (
    <>
      <HomeGlobalStyles />
      <Helmet>
        <title>ICAN</title>
        <meta name="description" content="" />
      </Helmet>

      <div className="relative min-h-[100dvh] overflow-x-clip bg-[#f8f7f4] text-[#101828] [font-family:'Geist','Plus_Jakarta_Sans',sans-serif]">
        <div className="relative">
          <BackgroundOrbs />
          <FloatingMorphHeader navItems={NAV_ITEMS} onNavigate={handleNavigate} />

          <main className="relative z-[3] mx-auto flex w-full max-w-[1240px] flex-col px-4 pb-24 pt-28 md:px-8 md:pb-36 md:pt-40">
            <HeroSection />
            <FundersSection funders={FUNDERS} />
          </main>
        </div>

        <FullFooterSection onNavigate={handleNavigate} />
      </div>
    </>
  );
}
