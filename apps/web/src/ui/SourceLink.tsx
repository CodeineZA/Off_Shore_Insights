// A link to where a figure came from, shown as the site's address. No address stored → "no source yet", never a dead link.
export default function SourceLink({ url }: { url: string | null }) {
  if (!url || !/^https?:\/\//i.test(url)) return <span className="muted">no source yet</span>;
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  return <a href={url} target="_blank" rel="noreferrer">{host} ↗</a>;
}
