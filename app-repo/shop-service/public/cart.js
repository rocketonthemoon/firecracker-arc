// Cart: change quantities, remove items, go to checkout.
const box = document.getElementById('cart');

async function render() {
  box.replaceChildren();
  const items = Cart.get();
  if (items.length === 0) {
    box.append(el('p', {}, 'Your cart is empty. ', el('a', { href: '/', textContent: 'Browse products' })));
    return;
  }

  const { ok, data: products } = await getJson('/api/products');
  if (!ok) { box.append(el('p', { textContent: 'Could not load products.' })); return; }
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  const tbody = el('tbody');
  let total = 0;
  let problems = false;

  for (const it of items) {
    const p = byId[it.productId];
    if (!p) { Cart.set(it.productId, 0); continue; } // product no longer exists

    const qty = el('input', { type: 'number', className: 'qty', min: 1, max: 100, value: it.qty });
    qty.onchange = () => { Cart.set(p.id, Math.max(0, Number(qty.value) || 0)); render(); };
    const remove = el('button', { textContent: 'Remove' });
    remove.onclick = () => { Cart.set(p.id, 0); render(); };

    const tooMany = it.qty > p.stock;
    if (tooMany) problems = true;
    total += p.price * it.qty;

    tbody.append(el('tr', {},
      el('td', {}, el('img', { className: 'thumb', src: p.image, alt: '' })),
      el('td', {}, el('a', { href: `/product?id=${p.id}`, textContent: p.name }),
        el('br'), tooMany ? el('small', { className: 'out', textContent: `Only ${p.stock} in stock` }) : ''),
      el('td', { textContent: money(p.price) }),
      el('td', {}, qty),
      el('td', { textContent: money(p.price * it.qty) }),
      el('td', {}, remove),
    ));
  }

  const checkout = el('button', { textContent: 'Checkout', disabled: problems });
  checkout.onclick = () => { location.href = '/checkout'; };

  box.append(
    el('table', {},
      el('thead', {}, el('tr', {}, ...['', 'Product', 'Price', 'Qty', 'Subtotal', ''].map((h) => el('th', { textContent: h })))),
      tbody),
    el('p', { className: 'total', textContent: `Total: ${money(total)}` }),
    el('div', { className: 'row' }, checkout,
      problems ? el('small', { className: 'out', textContent: 'Fix quantities before checkout.' }) : ''),
  );
}

render();
