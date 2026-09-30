// n8n Code node — W3 "Format summary". Input: rpc/monthly_summary (one object).
const s = $json;
const esc = (x) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const byStatus = Object.entries(s.flags_by_status || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
const lines = [
  `📊 <b>Off_Shore_Insights — ${esc(s.month)}</b>`,
  `Flags raised: <b>${s.flags_raised}</b> (${esc(byStatus)})`,
  `Open: ${s.open_pending} pending, ${s.open_needs_update} needing an update in Studio`,
  `Due for re-check this month: ${s.due_next_month}`,
  `Rates with conflicting sources: ${s.needs_verification}` +
    (s.needs_verification ? `\n  ${esc((s.needs_verification_list || []).join(', '))}` : ''),
  `Workflow errors last month: ${s.workflow_errors}`,
];
return { json: { text: lines.join('\n') } };
