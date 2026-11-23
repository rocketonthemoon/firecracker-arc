# Mini Market

```
browser ──► shop-service :3000 ──► inventory-service :3001  (products, stock, images)
                               └──► payment-service   :3002  (fake card payments)
```

## Pages (shop-service)

| Page | |
|---|---|
| `/` | Product grid |
| `/product?id=N` | Details, stock left, add to cart |
| `/cart` | Change qty, remove, checkout |
| `/checkout` | Card + place order → confirmation |
| `/dashboard` | Revenue, orders, service health, stock, recent payments |

Cart lives in the browser (`localStorage`). Test card: any 16 digits, ending `0000` = declined.

## APIs

| Service | Endpoints |
|---|---|
| shop | `GET /api/products`, `GET /api/products/:id`, `POST /api/checkout {items:[{productId,qty}], card}`, `GET /api/dashboard`, `GET /images/:id.svg` (proxied) |
| inventory | `GET /products`, `GET /products/:id`, `POST /products/:id/reserve\|release {qty}`, `GET /images/:id.svg` |
| payment | `POST /pay {amount, card}`, `GET /payments` |

All have `GET /health`.

## Checkout flow

1. Reserve stock for each item → 2. Pay total → any failure: release everything reserved.

## Run

```bash
docker compose up --build        # http://localhost:3000
```

Without Docker (3 terminals):
```bash
node inventory-service/index.js
node payment-service/index.js
node shop-service/index.js
```

## Notes

- No npm dependencies (Node built-ins only), `node:22-alpine`, runs as `node` user.
- Local `water.css`, strict CSP `default-src 'self'`, no `innerHTML`.
- Data is in-memory: restarting a service resets stock / payments.
