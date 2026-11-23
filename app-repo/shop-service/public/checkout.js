// Checkout: order summary + card -> POST /api/checkout -> confirmation.
(async () => {
  const box = document.getElementById('checkout');
  const items = Cart.get();
  if (items.length === 0) {
    box.append(el('p', {}, 'Your cart is empty. ', el('a', { href: '/', textContent: 'Browse products' })));
    return;
  }

  const { ok, data: products } = await getJson('/api/products');
  if (!ok) { box.append(el('p', { textContent: 'Could not load products.' })); return; }
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const summary = el('tbody');
  let total = 0;
  for (const it of items) {
    const p = byId[it.productId];
    if (!p) continue;
    total += p.price * it.qty;
    summary.append(el('tr', {},
      el('td', { textContent: `${it.qty} x ${p.name}` }),
      el('td', { textContent: money(p.price * it.qty) })));
  }

  const card = el('input', { value: '4242424242424242', size: 18, inputMode: 'numeric', autocomplete: 'off' });
  const pay = el('button', { textContent: `Pay ${money(total)}` });
  const msg = el('p');

  pay.onclick = async () => {
    pay.disabled = true;
    msg.textContent = 'Processing...';
    const r = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Cart.get(), card: card.value.replace(/\s/g, '') }),
    });
    const data = await r.json();
    if (!r.ok) {
      msg.replaceChildren(el('span', { className: 'out', textContent: `Order failed: ${data.error}` }));
      pay.disabled = false;
      return;
    }

    Cart.clear();
    box.replaceChildren(
      el('h2', { className: 'ok', textContent: 'Thank you for your order!' }),
      el('p', { textContent: `Order ${data.orderId}` }),
      el('ul', {}, ...data.items.map((l) => el('li', { textContent: `${l.qty} x ${l.name} - ${money(l.price * l.qty)}` }))),
      el('p', { className: 'total', textContent: `Paid ${money(data.total)} with card ${data.payment.card}` }),
      el('p', {}, el('a', { href: '/', textContent: 'Continue shopping' })),
    );
  };

  box.append(
    el('table', {}, summary),
    el('p', { className: 'total', textContent: `Total: ${money(total)}` }),
    el('label', { textContent: 'Card number ' }, card),
    el('small', { className: 'muted', textContent: 'Test card: any 16 digits. Ending in 0000 = declined.' }),
    el('p', {}, pay),
    msg,
  );
})();
