// Horizontal stacked bars of the sample-client bill (G5 across countries, C4 across the three
// homes). Segments = capital gains / wealth taxes / inheritance; unknown parts are hatched.
import type { Bill, BillPart } from '../data/model';
import { fmtEur, useGrown, useTip } from './common';

export const PART_COLOR: Record<BillPart['key'], string> = { cgt: '#f3dcb2', wealth: '#d8b07a', inheritance: '#8a6844' };

export default function BillBars({ bills, show, sortDesc = true, depKey }: { bills: Bill[]; show: BillPart['key'][]; sortDesc?: boolean; depKey: string }) {
  const rows = bills.map((b) => {
    const parts = b.parts.filter((p) => show.includes(p.key));
    return { b, parts, total: parts.reduce((s, p) => s + p.eur, 0), complete: parts.every((p) => p.known) };
  });
  if (sortDesc) rows.sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const grown = useGrown([depKey]);
  const t = useTip<(typeof rows)[number]>();
  return (
    <div className="bills" ref={t.box} onMouseLeave={t.hide}>
      {rows.map((r) => (
        <div className="bill-row" key={r.b.code} onMouseMove={t.show(r)} onClick={t.show(r)}>
          <div className="rank-name">{r.b.name}</div>
          <div className="rank-bar">
            {r.parts.map((p) => p.eur > 0 && (
              <div key={p.key} className="rank-seg" style={{ width: grown ? `${(p.eur / max) * 100}%` : 0, background: PART_COLOR[p.key] }} />
            ))}
            {!r.complete && <div className="rank-seg unknown" style={{ width: grown ? '5%' : 0 }} />}
          </div>
          <div className="bill-total">{fmtEur(r.total)}{!r.complete && <span className="incomplete">+?</span>}</div>
        </div>
      ))}
      {t.tip && (
        <div className="tip" style={t.style(250)}>
          <div className="tip-k">{t.tip.data.b.name} · paid over the period</div>
          <div className="tip-v">{fmtEur(t.tip.data.total)}</div>
          {t.tip.data.parts.map((p) => (
            <div className="tip-l" key={p.key}><b style={{ color: PART_COLOR[p.key] }}>{p.label}</b> {p.known ? fmtEur(p.eur) : `${fmtEur(p.eur)} + unknown (${p.missing.join(', ')})`}</div>
          ))}
          <div className="tip-l muted">Heirs receive {fmtEur(t.tip.data.b.heirsGet)}</div>
        </div>
      )}
    </div>
  );
}
