// G4 · Tax pressure map (heatmap). Countries × tax types, colour intensity = headline_rate.
// Grey hatching = unknown (no row); a real 0% is the darkest colour with "0".
import { useRef, useState } from 'react';
import type { Dashboard, TaxType } from '../data/types';
import { CATEGORIES, fmtDate, heatmap, hostOf, pct, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { Card, useCompact } from './common';

const LO = [42, 38, 34], HI = [243, 220, 178];               // #2a2622 → #f3dcb2
const mix = (t: number) => `rgb(${LO.map((l, i) => Math.round(l + (HI[i] - l) * t)).join(',')})`;

export default function G4Heatmap({ d, cc, types }: { d: Dashboard; cc: string[]; types: TaxType[] }) {
  const compact = useCompact();
  const h = heatmap(d, cc, types);
  const top = h.rows.flatMap((r) => r.cells.map((c, i) => ({ r, c, t: h.cols[i] }))).filter((x) => x.c.rate).sort((a, b) => b.c.rate!.headline_rate - a.c.rate!.headline_rate)[0];
  const scale = niceMax(Math.max(h.max, 10));
  const [tip, setTip] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const show = (r: number, c: number, e: React.MouseEvent) => {
    const b = box.current!.getBoundingClientRect();
    setTip({ r, c, x: e.clientX - b.left, y: e.clientY - b.top });
  };
  const groups = CATEGORIES.map((g) => ({ ...g, n: h.cols.filter((t) => t.category === g.key).length })).filter((g) => g.n > 0);
  const cell = tip ? h.rows[tip.r].cells[tip.c].rate : null;
  const col = tip ? h.cols[tip.c] : null;

  return (
    <Card id="g4" full title="Tax pressure map"
      metric={{ value: `${h.known}/${h.total}`, label: 'rates known', sub: top ? `peak ${top.r.code} ${shortLabel(top.t)} ${pct(top.c.rate!.headline_rate)}` : undefined }} purpose={`Where the pain is, tax by tax · ${h.known} of ${h.total} rates known`}
      foot={<div className="heat-legend">
        <span>0%</span><span className="ramp" /><span>{scale}%</span>
        <span className="sw unknown" /><span>Unknown</span>
        <span className="sw check" /><span>Conflicting sources</span>
      </div>}>
      {compact ? (
        <div className="mini-heat" style={{ gridTemplateColumns: `28px repeat(${h.cols.length}, 1fr)` }}>
          {h.rows.map((row) => [<span key={row.code} className="mini-code">{row.code}</span>, ...row.cells.map((c, ci) => (
            <span key={row.code + ci} className={'mini-cell' + (c.rate ? '' : ' unknown')} style={c.rate ? { background: mix(Math.min(1, c.rate.headline_rate / scale)) } : undefined} />))])}
        </div>
      ) : !h.rows.length || !h.cols.length ? <div className="empty">Select at least one country and one tax category.</div> : (
        <div className="heat-wrap" ref={box} onMouseLeave={() => setTip(null)}>
          <table className="heat" style={{ minWidth: 150 + h.cols.length * 60 }}>
            <colgroup><col style={{ width: 150 }} />{h.cols.map((c) => <col key={c.code} />)}</colgroup>
            <thead>
              <tr>
                <th />
                {groups.map((g) => <th key={g.key} colSpan={g.n} className="heat-group">{g.label}</th>)}
              </tr>
              <tr>
                <th />
                {h.cols.map((t) => <th key={t.code} className="heat-col" title={t.label}>{shortLabel(t)}</th>)}
              </tr>
            </thead>
            <tbody>
              {h.rows.map((row, r) => (
                <tr key={row.code}>
                  <th className="heat-row">{row.name}</th>
                  {row.cells.map((c, ci) => {
                    const v = c.rate?.headline_rate;
                    const t = v == null ? 0 : Math.min(1, v / scale);
                    return (
                      <td key={ci} onMouseMove={(e) => show(r, ci, e)} onClick={(e) => show(r, ci, e)}>
                        <div className={'heat-cell' + (v == null ? ' unknown' : '') + (c.rate?.needs_verification ? ' check' : '')}
                          style={{ background: v == null ? undefined : mix(t), color: t > 0.55 ? '#1a1714' : '#ece6dc',
                            animationDelay: `${(r * h.cols.length + ci) * 12}ms` }}>
                          {v == null ? '?' : pct(v).replace('%', '')}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {tip && col && (
            <div className="tip" style={{ left: Math.min(tip.x + 14, (box.current?.clientWidth ?? 400) - 250), top: tip.y + 14 }}>
              <div className="tip-k">{h.rows[tip.r].name} · {col.label}</div>
              {cell ? (<>
                <div className="tip-v">{pct(cell.headline_rate)}{cell.rate_min != null && cell.rate_max != null && cell.rate_min !== cell.rate_max ? <small> range {pct(cell.rate_min)}–{pct(cell.rate_max)}</small> : null}</div>
                {cell.threshold_note && <div className="tip-l">{cell.threshold_note}</div>}
                {cell.note && <div className="tip-l">{cell.note}</div>}
                {cell.inherited && <div className="tip-l">Inherited from the national rate.</div>}
                {cell.needs_verification && <div className="tip-l warn">Conflicting sources: to verify.</div>}
                <div className="tip-l muted">{cell.source_url ? <a href={cell.source_url} target="_blank" rel="noreferrer">{hostOf(cell.source_url)} ↗</a> : 'No source yet'}{cell.verified_on ? ` · verified ${fmtDate(cell.verified_on)}` : ''}</div>
              </>) : <div className="tip-l">Unknown: not researched yet.</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
