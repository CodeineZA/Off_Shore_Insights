// The furniture every report page shares: the header line and the footer (the Van Wyk Auditors logo, "since 1991", the disclaimer, the page label).
import { fmtDate } from '../../data/insights';
import { STRUCTURES, type ReportOk } from '../../data/report';
import { LOGO_DATA_URI, LOGO_HEIGHT, LOGO_WIDTH } from './logo';

/** The logo is defined once (an SVG <image>, no <img> and no URL) and drawn in every footer with <use>, so it is in the file once. */
export function LogoDef() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false"><defs><image id="vw-logo" href={LOGO_DATA_URI} width={LOGO_WIDTH} height={LOGO_HEIGHT} /></defs></svg>;
}

export function Foot({ r, page, pages }: { r: ReportOk; page: number; pages: number }) {
  return (
    <footer className="rep-foot">
      <div className="rep-mark">
        <svg className="rep-logo" viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`} role="img" aria-label="Van Wyk Auditors logo"><use href="#vw-logo" /></svg>
        <span className="rep-since"><b>Van Wyk Auditors</b> <i>since 1991</i></span>
      </div>
      <span className="rep-note">Indicative only, not tax advice. An illustration built from stored tax rates and published index returns; past performance does not predict future returns.</span>
      <span className="rep-where">{r.homeName} · {r.hubName} {STRUCTURES[r.params.structure].label.toLowerCase()} · page {page} of {pages}</span>
    </footer>
  );
}

export function Head({ generatedOn }: { generatedOn: string }) {
  return <header className="rep-head"><span className="rep-brand">Off_Shore_Insights</span><span>{fmtDate(generatedOn)}</span></header>;
}
