// R1 · Name the files and write the short covering note. The rendered PDF comes from the HTTP node; the Excel and the
// recipient come from "Prepare" (looked up by name, so they do not depend on what the HTTP node carries forward).
const p = $('Prepare').item.json;
const pdf = $input.item.binary && $input.item.binary.pdf;
const xlsx = $('Prepare').item.binary && $('Prepare').item.binary.xlsx;
if (!pdf || !xlsx) throw new Error('R1: the PDF or the Excel is missing');
pdf.fileName = p.filenameBase + '.pdf';
pdf.mimeType = 'application/pdf';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1d1610;max-width:560px;line-height:1.5">'
  + '<p style="margin:0 0 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a5f22;font-weight:bold">Off_Shore_Insights</p>'
  + '<p style="margin:0 0 14px;font-size:16px;font-weight:bold">Your report is attached</p>'
  + '<p style="margin:0 0 14px;font-size:14px">' + esc(p.summary) + '</p>'
  + '<p style="margin:0 0 6px;font-size:13px">Attached:</p>'
  + '<ul style="margin:0 0 14px;padding-left:18px;font-size:13px"><li>' + esc(pdf.fileName) + ': the report, 3 pages</li><li>' + esc(xlsx.fileName) + ': the raw values and sources, one sheet each</li></ul>'
  + '<p style="margin:0;font-size:11px;color:#6f604b">Indicative only, not tax advice. An illustration built from stored tax rates and published index returns; past performance does not predict future returns.</p>'
  + '</div>';
return { json: { to: p.to, subject: p.subject, html }, binary: { pdf, xlsx } };
