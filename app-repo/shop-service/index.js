const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3001';
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:3002';

// Static files: fixed allowlist, loaded once at startup (no path traversal possible)
const pub = (f) => fs.readFileSync(path.join(__dirname, 'public', f));
const HTML = 'text/html; charset=utf-8';
const JS = 'text/javascript';
const CSS = 'text/css';
const STATIC = {
  '/':             [HTML, pub('index.html')],
  '/product':      [HTML, pub('product.html')],
  '/cart':         [HTML, pub('cart.html')],
  '/checkout':     [HTML, pub('checkout.html')],
  '/dashboard':    [HTML, pub('dashboard.html')],
  '/common.js':    [JS, pub('common.js')],
  '/home.js':      [JS, pub('home.js')],
  '/product.js':   [JS, pub('product.js')],
  '/cart.js':      [JS, pub('cart.js')],
  '/checkout.js':  [JS, pub('checkout.js')],
  '/dashboard.js': [JS, pub('dashboard.js')],
  '/water.css':    [CSS, pub('water.css')],
  '/app.css':      [CSS, pub('app.css')],
};

// Everything is served from this origin -> strict CSP (no inline scripts/styles, no CDNs)
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('invalid json')); }
    });
  });
}

// Call another service; returns { status, data }
async function call(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  return { status: r.status, data: await r.json() };
}

// Give back stock for already-reserved lines (order failed half-way)
function releaseAll(lines) {
  return Promise.allSettled(lines.map((l) =>
    call(`${INVENTORY_URL}/products/${l.productId}/release`, 'POST', { qty: l.qty })));
}

// POST /api/checkout { items: [{ productId, qty }], card }
//   1. reserve stock for every line   2. pay the total
//   any failure -> release everything reserved so far
async function checkout(req, res) {
  const { items, card } = await readJson(req);
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return send(res, 400, { error: 'cart must have 1-20 items' });
  }
  for (const it of items) {
    if (!Number.isInteger(it.productId) || !Number.isInteger(it.qty) || it.qty < 1 || it.qty > 100) {
      return send(res, 400, { error: 'invalid cart item' });
    }
  }

  const lines = [];
  for (const { productId, qty } of items) {
    const product = await call(`${INVENTORY_URL}/products/${productId}`);
    if (product.status !== 200) {
      await releaseAll(lines);
      return send(res, product.status, product.data);
    }
    const reserve = await call(`${INVENTORY_URL}/products/${productId}/reserve`, 'POST', { qty });
    if (reserve.status !== 200) {
      await releaseAll(lines);
      return send(res, reserve.status, { error: `${product.data.name}: ${reserve.data.error}` });
    }
    lines.push({ productId, name: product.data.name, price: product.data.price, qty });
  }

  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const payment = await call(`${PAYMENT_URL}/pay`, 'POST', { amount: total, card });
  if (payment.status !== 200) {
    await releaseAll(lines);
    return send(res, payment.status, payment.data);
  }

  send(res, 200, { orderId: crypto.randomUUID(), items: lines, total, payment: payment.data });
}

// Pages:  /  /product?id=N  /cart  /checkout  /dashboard
// API:    GET /api/products, GET /api/products/:id, POST /api/checkout, GET /api/dashboard
http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') return send(res, 200, { ok: true });

    const file = req.method === 'GET' && STATIC[pathname];
    if (file) {
      res.writeHead(200, { 'Content-Type': file[0], ...SECURITY_HEADERS });
      return res.end(file[1]);
    }

    // Product images live in inventory-service; proxy them so the browser only talks to us
    const img = pathname.match(/^\/images\/(\d+\.svg)$/);
    if (img && req.method === 'GET') {
      const r = await fetch(`${INVENTORY_URL}/images/${img[1]}`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) return send(res, 404, { error: 'not found' });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
        ...SECURITY_HEADERS,
      });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }

    if (pathname === '/api/products' && req.method === 'GET') {
      const { status, data } = await call(`${INVENTORY_URL}/products`);
      return send(res, status, data);
    }

    const m = pathname.match(/^\/api\/products\/(\d+)$/);
    if (m && req.method === 'GET') {
      const { status, data } = await call(`${INVENTORY_URL}/products/${m[1]}`);
      return send(res, status, data);
    }

    if (pathname === '/api/checkout' && req.method === 'POST') {
      return await checkout(req, res);
    }

    if (pathname === '/api/dashboard' && req.method === 'GET') {
      // allSettled: one service being down must not break the whole dashboard
      const [inv, pay] = await Promise.allSettled([
        call(`${INVENTORY_URL}/products`),
        call(`${PAYMENT_URL}/payments`),
      ]);
      const ok = (r) => r.status === 'fulfilled' && r.value.status === 200;
      return send(res, 200, {
        services: { shop: 'up', inventory: ok(inv) ? 'up' : 'down', payment: ok(pay) ? 'up' : 'down' },
        products: ok(inv) ? inv.value.data : [],
        payments: ok(pay) ? pay.value.data : null,
      });
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e.message);
    send(res, 502, { error: 'upstream error' });
  }
}).listen(PORT, () => console.log(`shop-service listening on :${PORT}`));
