/**
 * Server-rendered admin UI. Single page, vanilla JS, no build step.
 * Mounted at `${BASE_PATH}/admin`. The browser fetches `${BASE_PATH}/api/admin/*`.
 */
export function renderAdminPage(basePath: string): string {
  const apiBase = `${basePath}/api/admin`;
  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FacilityTrack Licence Admin</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    header { background: #1e293b; padding: 16px 24px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; }
    h1 { margin: 0; font-size: 18px; }
    main { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px 16px; }
    .stat .v { font-size: 24px; font-weight: 700; }
    .stat .l { font-size: 12px; color: #94a3b8; text-transform: uppercase; }
    section { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    h2 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; }
    form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end; }
    label { display: flex; flex-direction: column; font-size: 12px; color: #cbd5e1; gap: 4px; }
    input, textarea { background: #0f172a; border: 1px solid #475569; border-radius: 6px; padding: 8px 10px; color: #e2e8f0; font: inherit; }
    button { background: #2563eb; border: 0; border-radius: 6px; color: white; padding: 9px 14px; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #475569; }
    button.danger { background: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 500; text-transform: uppercase; font-size: 11px; }
    code { background: #0f172a; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .badge-active { background: #064e3b; color: #6ee7b7; }
    .badge-revoked { background: #7f1d1d; color: #fca5a5; }
    .badge-expired { background: #78350f; color: #fcd34d; }
    .row-actions button { padding: 4px 8px; font-size: 12px; margin-right: 4px; }
    .key-cell button { padding: 2px 6px; font-size: 11px; margin-left: 4px; }
    .empty { padding: 24px; text-align: center; color: #94a3b8; }
  </style>
</head>
<body>
  <header><h1>FacilityTrack &mdash; Licence Admin</h1><span id="ver" style="color:#94a3b8;font-size:12px"></span></header>
  <main>
    <div class="stats" id="stats"></div>
    <section>
      <h2>Issue new licence</h2>
      <form id="new-form">
        <label>Customer name<input name="customerName" required /></label>
        <label>Email (optional)<input name="customerEmail" type="email" /></label>
        <label>Expires<input name="expiresAt" type="date" required /></label>
        <label>Notes<input name="notes" /></label>
        <button type="submit">Issue licence</button>
      </form>
    </section>
    <section>
      <h2>All licences</h2>
      <div id="list"></div>
    </section>
  </main>

  <script>
    const API = ${JSON.stringify(apiBase)};
    const fmtDate = (s) => new Date(s).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
    const fmtDateTime = (s) => new Date(s).toLocaleString();

    async function loadStats() {
      const r = await fetch(API + '/stats', { credentials: 'include' });
      if (!r.ok) return;
      const s = await r.json();
      document.getElementById('stats').innerHTML = [
        ['Total', s.total], ['Active', s.active], ['Expired', s.expired],
        ['Revoked', s.revoked], ['Validations 24h', s.validations24h],
      ].map(([l,v])=>'<div class="stat"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>').join('');
    }

    function badge(lic) {
      if (lic.status === 'revoked') return '<span class="badge badge-revoked">revoked</span>';
      if (new Date(lic.expiresAt).getTime() < Date.now()) return '<span class="badge badge-expired">expired</span>';
      return '<span class="badge badge-active">active</span>';
    }

    async function loadList() {
      const r = await fetch(API + '/licenses', { credentials: 'include' });
      if (!r.ok) {
        document.getElementById('list').innerHTML = '<div class="empty">Failed to load licences (' + r.status + ').</div>';
        return;
      }
      const rows = await r.json();
      if (rows.length === 0) {
        document.getElementById('list').innerHTML = '<div class="empty">No licences yet. Issue one above.</div>';
        return;
      }
      const html = ['<table><thead><tr>',
        '<th>Customer</th><th>Key</th><th>Status</th><th>Expires</th><th>Created</th><th>Actions</th>',
        '</tr></thead><tbody>'];
      for (const r of rows) {
        html.push('<tr>',
          '<td>', escapeHtml(r.customerName), r.customerEmail ? '<br><small style="color:#94a3b8">'+escapeHtml(r.customerEmail)+'</small>' : '', '</td>',
          '<td class="key-cell"><code>', r.key, '</code><button class="secondary" data-copy="',r.key,'">copy</button></td>',
          '<td>', badge(r), '</td>',
          '<td>', fmtDate(r.expiresAt), '</td>',
          '<td><small>', fmtDateTime(r.createdAt), '</small></td>',
          '<td class="row-actions">',
          r.status === 'active'
            ? '<button class="danger" data-revoke="'+r.id+'">Revoke</button>'
            : '<button class="secondary" data-reactivate="'+r.id+'">Reactivate</button>',
          ' <button class="secondary" data-extend="'+r.id+'">+1y</button>',
          '</td>',
        '</tr>');
      }
      html.push('</tbody></table>');
      document.getElementById('list').innerHTML = html.join('');
    }

    function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

    document.getElementById('new-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      const r = await fetch(API + '/licenses', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!r.ok) { alert('Failed: ' + r.status + ' ' + await r.text()); return; }
      e.target.reset();
      await Promise.all([loadStats(), loadList()]);
    });

    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const copy = t.getAttribute('data-copy');
      if (copy) { await navigator.clipboard.writeText(copy); t.textContent = 'copied'; setTimeout(()=>t.textContent='copy', 1000); return; }
      const revoke = t.getAttribute('data-revoke');
      if (revoke) {
        if (!confirm('Revoke this licence?')) return;
        await fetch(API + '/licenses/' + revoke, { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status:'revoked'}) });
        await Promise.all([loadStats(), loadList()]);
      }
      const reactivate = t.getAttribute('data-reactivate');
      if (reactivate) {
        await fetch(API + '/licenses/' + reactivate, { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status:'active'}) });
        await Promise.all([loadStats(), loadList()]);
      }
      const extend = t.getAttribute('data-extend');
      if (extend) {
        const d = new Date(); d.setFullYear(d.getFullYear() + 1);
        await fetch(API + '/licenses/' + extend, { method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({expiresAt: d.toISOString()}) });
        await Promise.all([loadStats(), loadList()]);
      }
    });

    loadStats();
    loadList();
  </script>
</body>
</html>`;
}
