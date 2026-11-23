// Dashboard page. Polls /api/dashboard every 5s.
const $ = (id) => document.getElementById(id);

function row(tbody, ...values) {
  const tr = tbody.insertRow();
  for (const v of values) tr.insertCell().textContent = v;
}

async function refresh() {
  const r = await fetch('/api/dashboard');
  const d = await r.json();

  const p = d.payments;
  $('revenue').textContent = p ? '$' + p.revenue : 'n/a';
  $('orders').textContent = p ? p.approved : 'n/a';
  $('declined').textContent = p ? p.declined : 'n/a';

  $('services').replaceChildren();
  for (const [name, status] of Object.entries(d.services)) {
    row($('services'), name, status === 'up' ? 'UP' : 'DOWN');
  }

  $('stock').replaceChildren();
  for (const item of d.products) {
    row($('stock'), item.name, item.stock, item.stock === 0 ? 'sold out' : item.stock < 5 ? 'low' : '');
  }

  $('payments').replaceChildren();
  for (const pay of p ? p.recent : []) {
    row($('payments'), new Date(pay.time).toLocaleTimeString(), '$' + pay.amount, pay.card, pay.id.slice(0, 8));
  }
}

refresh();
setInterval(refresh, 5000);
