const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

// Mock product images: images/<id>.svg, loaded once at startup (fixed set, no path traversal)
const IMAGE_DIR = path.join(__dirname, 'images');
const images = Object.fromEntries(
  fs.readdirSync(IMAGE_DIR)
    .filter((f) => /^\d+\.svg$/.test(f))
    .map((f) => [f, fs.readFileSync(path.join(IMAGE_DIR, f))]),
);

// In-memory stock (resets on restart)
const products = {
  1: { id: 1, name: 'Laptop', category: 'Electronics', price: 999, stock: 5,
       description: '14-inch laptop with 16 GB RAM, 512 GB SSD and a 10-hour battery.' },
  2: { id: 2, name: 'Headphones', category: 'Audio', price: 199, stock: 10,
       description: 'Over-ear wireless headphones with active noise cancelling.' },
  3: { id: 3, name: 'Mechanical Keyboard', category: 'Accessories', price: 49, stock: 0,
       description: 'Full-size mechanical keyboard, US layout, brown switches.' },
  4: { id: 4, name: 'Wireless Mouse', category: 'Accessories', price: 29, stock: 25,
       description: 'Compact wireless mouse with USB receiver.' },
  5: { id: 5, name: '4K Monitor', category: 'Electronics', price: 349, stock: 3,
       description: '27-inch 4K IPS monitor with USB-C input.' },
  6: { id: 6, name: 'USB-C Hub', category: 'Accessories', price: 39, stock: 15,
       description: '7-in-1 hub: HDMI, 3x USB-A, SD card, USB-C power.' },
};
for (const p of Object.values(products)) p.image = `/images/${p.id}.svg`;

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
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

// GET  /products              list
// GET  /products/:id          one product
// POST /products/:id/reserve  { qty }  take stock
// POST /products/:id/release  { qty }  give stock back (payment failed)
// GET  /images/:id.svg        product image
http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return send(res, 200, { ok: true });

    const img = req.url.match(/^\/images\/(\d+\.svg)$/);
    if (img && req.method === 'GET') {
      if (!images[img[1]]) return send(res, 404, { error: 'no such image' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
      return res.end(images[img[1]]);
    }

    const m = req.url.match(/^\/products(?:\/(\d+)(?:\/(reserve|release))?)?$/);
    if (!m) return send(res, 404, { error: 'not found' });
    const [, id, action] = m;

    if (!id) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      return send(res, 200, Object.values(products));
    }

    const p = products[id];
    if (!p) return send(res, 404, { error: 'no such product' });

    if (!action) {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
      return send(res, 200, p);
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    const { qty } = await readJson(req);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return send(res, 400, { error: 'qty must be an integer 1-100' });
    }

    if (action === 'reserve') {
      if (p.stock < qty) return send(res, 409, { error: 'out of stock' });
      p.stock -= qty;
    } else {
      p.stock += qty;
    }
    send(res, 200, p);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`inventory-service listening on :${PORT}`));
