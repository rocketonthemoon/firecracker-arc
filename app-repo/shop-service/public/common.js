// Shared helpers: cart (stored in this browser), DOM builder, header cart count.
// Text is always set via textContent (never innerHTML) -> product data can't inject HTML.

const Cart = {
  get() {
    try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; }
  },
  save(items) {
    try { localStorage.setItem('cart', JSON.stringify(items)); } catch { /* storage blocked */ }
    updateCartCount();
  },
  qtyOf(productId) {
    const it = Cart.get().find((i) => i.productId === productId);
    return it ? it.qty : 0;
  },
  add(productId, qty) {
    const items = Cart.get();
    const it = items.find((i) => i.productId === productId);
    if (it) it.qty += qty; else items.push({ productId, qty });
    Cart.save(items);
  },
  set(productId, qty) {
    const items = Cart.get().filter((i) => i.productId !== productId);
    if (qty > 0) items.push({ productId, qty });
    Cart.save(items.sort((a, b) => a.productId - b.productId));
  },
  clear() { Cart.save([]); },
  count() { return Cart.get().reduce((n, i) => n + i.qty, 0); },
};

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

const money = (n) => '$' + n.toLocaleString('en-US');

function stockLabel(stock) {
  if (stock === 0) return el('span', { className: 'out', textContent: 'Sold out' });
  if (stock < 5) return el('span', { className: 'low', textContent: `Only ${stock} left` });
  return el('span', { className: 'ok', textContent: `In stock (${stock})` });
}

async function getJson(url) {
  const r = await fetch(url);
  return { ok: r.ok, data: await r.json() };
}

function updateCartCount() {
  const c = document.getElementById('cart-count');
  if (c) c.textContent = Cart.count();
}

updateCartCount();
