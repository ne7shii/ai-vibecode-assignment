import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { tf, tp } from '@/i18n/public';
import { loadPublicRooms } from '@/components/public/server';
import PageHero from '@/components/public/PageHero';
import Reviews from '@/components/public/Reviews';
import ChatWidget from '@/components/public/ChatWidget';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').reviewsPageTitle };
}

export default async function ReviewsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const { rooms } = await loadPublicRooms();
  return (
    <>
      <PageHero img="/brand/resort/pool-main.jpg" kicker={t.reviewsEyebrow} title={t.reviewsPageTitle} lead={t.reviewsPageLead} testId="reviews-hero" />
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          <Reviews lang={lang} rooms={rooms.map((r) => ({ code: r.code, name: tf(r, 'name', lang) }))} withFilter />
          <p className="small muted center" style={{ marginTop: 28 }}>{t.writeReviewHint}</p>
        </div>
      </section>
      <ChatWidget lang={lang} />
    </>
  );
}
