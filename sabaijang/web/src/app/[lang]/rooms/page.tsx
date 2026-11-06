import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import { loadPublicRooms } from '@/components/public/server';
import PageHero from '@/components/public/PageHero';
import RoomsBrowser from '@/components/public/RoomsBrowser';
import ChatWidget from '@/components/public/ChatWidget';
import { CurrencyProvider, CurrencySelect } from '@/components/public/Currency';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').roomsPageTitle };
}

export default async function RoomsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const { rooms } = await loadPublicRooms();
  return (
    <CurrencyProvider>
      <PageHero img="/brand/rooms/r06-1-pool.jpg" kicker={t.roomsEyebrow} title={t.roomsPageTitle} lead={t.roomsPageLead} testId="rooms-hero" />
      <section className="section" style={{ paddingTop: 32 }}>
        <div className="container">
          <div style={{ marginBottom: 24 }}><CurrencySelect lang={lang} /></div>
          <RoomsBrowser rooms={rooms} lang={lang} />
        </div>
      </section>
      <ChatWidget lang={lang} />
    </CurrencyProvider>
  );
}
