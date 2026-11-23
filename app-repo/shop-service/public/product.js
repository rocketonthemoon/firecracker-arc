// Product details: /product?id=N
(async () => {
  const box = document.getElementById('product');
  const id = Number(new URLSearchParams(location.search).get('id'));
  const { ok, data: p } = await getJson(`/api/products/${id}`);
  if (!ok) { box.append(el('p', { textContent: 'Product not found.' })); return; }

  document.title = `${p.name} - Mini Market`;
  const qty = el('input', { type: 'number', className: 'qty', min: 1, max: Math.max(p.stock, 1), value: 1 });
  const add = el('button', { textContent: 'Add to cart', disabled: p.stock === 0 });
  const msg = el('p');

  add.onclick = () => {
    const n = Number(qty.value);
    const inCart = Cart.qtyOf(p.id);
    if (!Number.isInteger(n) || n < 1) { msg.textContent = 'Enter a valid quantity.'; return; }
    if (inCart + n > p.stock) {
      msg.textContent = `Only ${p.stock} in stock (you already have ${inCart} in your cart).`;
      return;
    }
    Cart.add(p.id, n);
    msg.replaceChildren(`Added ${n} to cart. `, el('a', { href: '/cart', textContent: 'View cart' }));
  };

  box.append(el('div', { className: 'product' },
    el('img', { src: p.image, alt: p.name }),
    el('div', {},
      el('small', { className: 'muted', textContent: p.category }),
      el('h1', { textContent: p.name }),
      el('p', { textContent: p.description }),
      el('p', { className: 'price', textContent: money(p.price) }),
      el('p', {}, stockLabel(p.stock)),
      el('div', { className: 'row' }, el('label', { textContent: 'Qty ' }, qty), add),
      msg,
    ),
  ));
})();
