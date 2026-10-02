// "Sources" for whatever the page is showing: the country or region, the tax years chosen, the tax you focused on (or, at
// the world level, the layers on the map). Every figure in the database carries a source URL and a check date; this gathers
// them, merges rows that came from the same page, and says what kind of source each is. No figure is invented here.
import type { Dashboard } from './types';
import { fmtCount, pct, shortLabel } from './insights';
import { MONEY, type MoneyKey } from './mapdata';
import { POOL_KEYS } from './pool';
import { inFocus, type TaxFocus } from './taxbars';
import { rateForYear, wealthUpToYear } from './years';

export type SourceKind = 'official' | 'report' | 'data' | 'secondary' | 'unknown';
export const KIND_LABEL: Record<SourceKind, string> = { official: 'Official', report: 'Report', data: 'Dataset', secondary: 'Secondary', unknown: '' };
export interface SourceEntry {
  key: string; url: string | null; name: string; host: string | null; kind: SourceKind;
  /** The page address as people read it: host and path, no query. For a dated copy, the page that was copied. */
  shown: string | null;
  /** Set when the link is a Wayback Machine copy: the date it was taken and the page it is a copy of. */
  archived: { on: string; original: string } | null;
  verifiedOn: string | null;
  /** A row that cites this page is flagged: only a secondary source, or sources disagree. */
  check: boolean;
  supports: string[];
  /** A report we hold as a file on Hentus's machine (not served by the site): shown as text, not a link. */
  file: string | null;
}
export interface SourceGroup { id: 'rates' | 'treaties' | 'lists' | 'money' | 'notes'; title: string; entries: SourceEntry[] }
export interface SourceContext { code: string | null; years: number[]; taxFocus: TaxFocus; metrics: MoneyKey[]; treaty: boolean; money: boolean }

const ARCHIVE = /^https?:\/\/web\.archive\.org\/web\/(\d{4})(\d{2})(\d{2})\d*[a-z_]*\/(https?:\/\/.+)$/i;
/** Only web links are ever rendered as links. */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const pretty = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch { return u; } };
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

// Named sources first; the last row recognises an authority's own site by its address. A page nothing here recognises is
// shown with its address and no tag: we never call a source official or secondary on a guess.
const KNOWN: { test: RegExp; name: string; kind: SourceKind }[] = [
  { test: /(^|\.)pwc\./i, name: 'PwC Worldwide Tax Summaries', kind: 'secondary' },
  { test: /(^|\.)kpmg\./i, name: 'KPMG', kind: 'secondary' },
  { test: /practiceguides\.chambers\.com/i, name: 'Chambers Practice Guides', kind: 'secondary' },
  { test: /belastingdienst\.nl/i, name: 'Belastingdienst (Dutch tax administration)', kind: 'official' },
  { test: /wetten\.overheid\.nl/i, name: 'wetten.overheid.nl (Dutch legislation)', kind: 'official' },
  { test: /(^|\.)mra\.mu$/i, name: 'Mauritius Revenue Authority', kind: 'official' },
  { test: /(^|\.)src\.gov\.sc$/i, name: 'Seychelles Revenue Commission', kind: 'official' },
  { test: /(^|\.)hcch\.net$/i, name: 'Hague Conference on Private International Law', kind: 'official' },
  { test: /ec\.europa\.eu\/eurostat/i, name: 'Eurostat', kind: 'data' },
  { test: /(^|\.)ilo\.org$/i, name: 'ILOSTAT (International Labour Organization)', kind: 'data' },
  { test: /(^|\.)ubs\.com$/i, name: 'UBS Global Wealth Report', kind: 'report' },
  { test: /(^|\.)knightfrank\./i, name: 'Knight Frank Wealth Report', kind: 'report' },
  { test: /(^|\.)capgemini\.com$/i, name: 'Capgemini World Wealth Report', kind: 'report' },
  { test: /(^|\.)(gov|gouv|gob|overheid|admin)\.[a-z]{2,3}(\.[a-z]{2})?$|(^|\.)europa\.eu$|gesetze-im-internet\.de$|agenziaentrate|dre\.pt$|(^|\.)fin\.belgium\.be$/i, name: '', kind: 'official' },
];
export function classify(url: string | null) {
  if (!url) return { name: 'No source recorded', host: null as string | null, kind: 'unknown' as SourceKind };
  const m = url.match(ARCHIVE);
  const real = m ? m[4] : url;
  const host = hostOf(real);
  // the host decides; Eurostat lives under a shared europa.eu host, so its path counts too
  const k = KNOWN.find((x) => (host != null && x.test.test(host)) || x.test.test(real.replace(/^https?:\/\//, '')));
  return { name: k?.name || host || real, host, kind: (k?.kind ?? 'unknown') as SourceKind };
}
/** Reports we hold as files (gitignored, so shown as text): matched on the source name the row carries. */
const FILES: [RegExp, string][] = [
  [/UBS Global Wealth Report 2026/i, 'PDFs/global-wealth-report-en-2026.pdf'],
  [/Knight Frank Wealth Report 2026/i, 'PDFs/146815_the-wealth-report-2026.pdf'],
];

class Collector {
  private groups = new Map<SourceGroup['id'], Map<string, SourceEntry>>();
  /** `sourceName` is the name a wealth row gives its own source ("UBS Global Wealth Report 2026"): more exact than the publisher. */
  add(group: SourceGroup['id'], raw: { url: string | null | undefined; support: string; verifiedOn?: string | null; check?: boolean; sourceName?: string }) {
    const url = safeUrl(raw.url);
    const key = url ?? `no-url:${raw.sourceName ?? group}`;
    const g = this.groups.get(group) ?? new Map<string, SourceEntry>();
    this.groups.set(group, g);
    let e = g.get(key);
    if (!e) {
      const c = classify(url);
      const arch = url ? url.match(ARCHIVE) : null;
      e = { key, url, name: raw.sourceName ?? c.name, host: c.host, kind: c.kind, shown: url ? pretty(arch ? arch[4] : url) : null,
        archived: arch ? { on: `${arch[1]}-${arch[2]}-${arch[3]}`, original: arch[4] } : null, verifiedOn: null, check: false, supports: [],
        file: raw.sourceName ? FILES.find(([re]) => re.test(raw.sourceName!))?.[1] ?? null : null };
      g.set(key, e);
    }
    if (!e.supports.includes(raw.support)) e.supports.push(raw.support);
    if (raw.verifiedOn && (!e.verifiedOn || raw.verifiedOn > e.verifiedOn)) e.verifiedOn = raw.verifiedOn;
    if (raw.check) e.check = true;
  }
  result(moneyTitle: string): SourceGroup[] {
    const titles: Record<SourceGroup['id'], string> = { rates: 'Tax rates', treaties: 'Treaties with Mauritius and Seychelles', lists: 'Blacklist and trust recognition', money: moneyTitle, notes: 'Notes in the brief' };
    return (['rates', 'treaties', 'lists', 'money', 'notes'] as const).filter((id) => this.groups.get(id)?.size)
      .map((id) => ({ id, title: titles[id], entries: [...this.groups.get(id)!.values()] }));
  }
}

const HUB_NAME: Record<string, string> = { MU: 'Mauritius', SC: 'Seychelles' };

export function sourcesFor(d: Dashboard, ctx: SourceContext): SourceGroup[] {
  const c = new Collector();
  const ys = [...ctx.years].sort((a, b) => a - b);
  const latest = ys[ys.length - 1] as number | undefined;
  const j = ctx.code ? d.jurisdictions.find((x) => x.code === ctx.code) : undefined;
  const country = j ? (j.kind === 'region' ? j.parent_code! : j.code) : null;
  const nameOf = (code: string) => d.jurisdictions.find((x) => x.code === code)?.name ?? code;

  if (j && latest != null) {
    // The rates the tax chart shows: this entity per selected year, both hubs in the latest year, and a country's regions for the taxes it sets per region.
    const children = d.jurisdictions.filter((x) => x.parent_code === j.code);
    for (const t of d.tax_types.filter((x) => inFocus(x, ctx.taxFocus))) {
      for (const y of ys) {
        const r = rateForYear(d, j.code, t.code, y);
        if (r) c.add('rates', { url: r.row.source_url, verifiedOn: r.row.verified_on, check: r.row.needs_verification,
          support: `${shortLabel(t)} ${pct(r.row.headline_rate!)} (${y})${r.inherited ? ` · from ${nameOf(r.row.jurisdiction_code)}` : ''}` });
      }
      for (const hub of ['MU', 'SC']) {
        const r = rateForYear(d, hub, t.code, latest);
        if (r) c.add('rates', { url: r.row.source_url, verifiedOn: r.row.verified_on, check: r.row.needs_verification, support: `${HUB_NAME[hub]}: ${shortLabel(t)} ${pct(r.row.headline_rate!)}` });
      }
      if ((j.regional_tax_types ?? []).includes(t.code)) for (const ch of children) {
        const r = rateForYear(d, ch.code, t.code, latest);
        if (r) c.add('rates', { url: r.row.source_url, verifiedOn: r.row.verified_on, check: r.row.needs_verification, support: `${ch.name}: ${shortLabel(t)} ${pct(r.row.headline_rate!)}` });
      }
    }
  }

  const countries = country ? [country] : d.jurisdictions.filter((x) => x.kind === 'country' && !x.is_offshore_hub).map((x) => x.code);
  if (country || ctx.treaty) {
    for (const cc of countries) for (const hub of ['MU', 'SC']) {
      const t = d.treaties.find((x) => x.country_a === hub && x.country_b === cc);
      if (t) c.add('treaties', { url: t.source_url, verifiedOn: t.verified_on, support: `${country ? '' : nameOf(cc) + ' · '}${HUB_NAME[hub]}: ${t.status.replace(/_/g, ' ')}` });
    }
  }
  if (country) {
    for (const g of d.gates.filter((x) => x.jurisdiction_code === country)) {
      c.add('lists', { url: g.source_url, verifiedOn: g.verified_on, check: g.needs_verification,
        support: g.gate === 'blacklist' ? `Blacklist, ${HUB_NAME[g.hub ?? ''] ?? 'both hubs'}: ${g.label}` : `Trust recognition: ${g.label}` });
    }
  }

  // The pool panel's tiers, plus whatever the map's money layer is showing.
  const keys: MoneyKey[] = country ? [...new Set<MoneyKey>([...POOL_KEYS, ...(ctx.money ? ctx.metrics : [])])] : ctx.money ? ctx.metrics : [];
  if (keys.length && latest != null) {
    for (const cc of countries) for (const key of keys) {
      for (const y of country ? ys : [latest]) {
        const w = wealthUpToYear(d, cc, key, y);
        if (w) c.add('money', { url: w.sourceUrl, verifiedOn: w.verifiedOn, sourceName: w.source,
          support: `${country ? '' : nameOf(cc) + ' · '}${MONEY.find((m) => m.key === key)!.label} ${key === 'private_wealth_usd_bn' ? `US$${w.value} bn` : fmtCount(w.value)} (${w.year}${w.carried ? ', carried forward' : ''})` });
      }
    }
  }

  if (country) for (const n of d.notes.filter((x) => x.jurisdiction_code === country && safeUrl(x.source_url))) {
    c.add('notes', { url: n.source_url, verifiedOn: n.verified_on, support: n.topic.replace(/_/g, ' ') });
  }
  return c.result(country ? 'Prospect pool' : 'Money bars on the map');
}

export const countSources = (groups: SourceGroup[]) => new Set(groups.flatMap((g) => g.entries.map((e) => e.key))).size;
export function contextLabel(d: Dashboard, ctx: SourceContext) {
  const j = ctx.code ? d.jurisdictions.find((x) => x.code === ctx.code) : undefined;
  if (!j) return 'World map: ' + ([ctx.treaty ? 'treaty colours' : '', ctx.money ? 'money bars' : ''].filter(Boolean).join(' and ') || 'no layers on');
  return `${j.name} · tax year${ctx.years.length > 1 ? 's' : ''} ${[...ctx.years].sort().join(', ')}`;
}
