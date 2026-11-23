const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3002;

// In-memory history (resets on restart)
const payments = [];          // last 50 approved payments
const stats = { approved: 0, declined: 0, revenue: 0 };

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

// POST /pay { amount, card }   fake payment: 16 digits ok, ending in 0000 = declined
// GET  /payments               stats + recent payments (for the dashboard)
http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') return send(res, 200, { ok: true });

    if (req.url === '/payments' && req.method === 'GET') {
      return send(res, 200, { ...stats, recent: payments.slice().reverse() });
    }

    if (req.url !== '/pay') return send(res, 404, { error: 'not found' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });

    const { amount, card } = await readJson(req);
    if (typeof amount !== 'number' || amount <= 0 || amount > 100_000) {
      return send(res, 400, { error: 'invalid amount' });
    }
    if (typeof card !== 'string' || !/^\d{16}$/.test(card)) {
      return send(res, 400, { error: 'card must be 16 digits' });
    }

    const last4 = card.slice(-4); // never log or store the full card number
    if (last4 === '0000') {
      stats.declined++;
      console.log(`declined amount=${amount} card=****${last4}`);
      return send(res, 402, { error: 'card declined' });
    }

    const payment = {
      id: crypto.randomUUID(),
      status: 'approved',
      amount,
      card: `****${last4}`,
      time: new Date().toISOString(),
    };
    payments.push(payment);
    if (payments.length > 50) payments.shift();
    stats.approved++;
    stats.revenue += amount;

    console.log(`approved ${payment.id} amount=${amount} card=****${last4}`);
    send(res, 200, payment);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`payment-service listening on :${PORT}`));
