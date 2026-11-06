import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import { CREDITS } from '@/components/public/credits-data';
import s from '@/components/public/public.module.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').creditsTitle };
}

const needsCredit = (lic: string) => /BY/.test(lic);

/** Photo credits, generated from brand-kit/CREDITS.md (CC BY / BY-SA must be attributed). */
export default async function CreditsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const folders = [...new Set(CREDITS.map((c) => c.file.split('/')[0]))];
  const counts = {
    free: CREDITS.filter((c) => !needsCredit(c.license)).length,
    by: CREDITS.filter((c) => /BY(?!-SA)/.test(c.license)).length,
    bysa: CREDITS.filter((c) => /BY-SA/.test(c.license)).length,
  };

  return (
    <section className="container" data-testid="credits">
      <div className={s.pageHead}>
        <div className={s.kicker}>brand-kit</div>
        <h1>{t.creditsTitle}</h1>
        <p className="muted" style={{ maxWidth: 760 }}>{t.creditsLead}</p>
        <div className="row small">
          <span className="badge">CC0 / Public Domain · {counts.free}</span>
          <span className="badge badge-gold">CC BY · {counts.by}</span>
          <span className="badge badge-gold">CC BY-SA · {counts.bysa}</span>
        </div>
      </div>
      {folders.map((f) => (
        <div key={f} style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22 }}>{f}/</h2>
          <div className="table-wrap">
            <table className="table" data-testid={`credits-table-${f}`}>
              <thead>
                <tr><th>{t.cFile}</th><th>{t.cTitle}</th><th>{t.cAuthor}</th><th>{t.cLicense}</th><th>{t.cSource}</th></tr>
              </thead>
              <tbody>
                {CREDITS.filter((c) => c.file.startsWith(`${f}/`)).map((c) => (
                  <tr key={c.file} data-testid="credit-row">
                    <td style={{ minWidth: 180 }}>
                      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                        <img src={`/brand/${c.file}`} alt="" loading="lazy" style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flex: 'none' }} />
                        <code style={{ fontSize: 12 }}>{c.file.split('/')[1]}</code>
                      </div>
                    </td>
                    <td style={{ minWidth: 200, wordBreak: 'break-word' }}>{c.title}</td>
                    <td style={{ minWidth: 120 }}>{c.author}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <a href={c.licenseUrl} target="_blank" rel="noreferrer license">{c.license}</a>
                      {needsCredit(c.license) && <div><span className="badge badge-gold">{t.needAttribution}</span></div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}><a href={c.sourceUrl} target="_blank" rel="noreferrer">{c.source} ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
