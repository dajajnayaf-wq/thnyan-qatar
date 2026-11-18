# AGENTS.md

## Project
Thonyan Farms Qatar (مزارع الثنيان قطر / مياه واحة قطر) — Arabic RTL e-commerce
storefront. Node.js + Express + Socket.IO backend, static frontend, PostgreSQL
(Neon) via `pg`, Firebase Admin, Web Push.

## Layout
- `backend/server.js` — Express API + Socket.IO, serves `frontend/` statically.
- `frontend/index.html` — storefront; `frontend/js/main.js` — shared client logic.
- `frontend/pages/` — flow pages: `product.html`, `select.html` (payment method),
  `delivery.html`, `payment.html`, `verification.html`.
- `frontend/admin/` — admin dashboard.
- `frontend/css/style.css` — single stylesheet.

## Run / verify
- Start: `cd backend && node server.js` (uses `backend/.env`).
- Preview URL (port 12000): https://work-1-uwznmcdmuvqcsbty.prod-runtime.all-hands.dev/
- Health: `GET /api/health` → `{"status":"ok",...}`. Admin at `/admin/`.

## Checkout flow
`index.html` (add to cart) → cart drawer → `pages/delivery.html` →
`pages/select.html` (choose card / cash) → `pages/payment.html` → `verification.html`.

## Cart notes (important)
- Cart persists in `localStorage` under `thonyan_cart` as slim items
  `{id, name_ar, price, quantity}`.
- Product images are multi-MB base64 blobs and MUST NOT be persisted: storing them
  exceeds the localStorage quota and silently caps the cart at one item. They are
  cached per page session in the in-memory `productImages` map and resolved via
  `resolveCartImage(id)`; `saveCart()` also falls back to slim items on quota error.
- Cart UI is injected at runtime by `injectCartUI()` (button in `.header-content`
  + `#cartDrawer` drawer appended to `<body>`). Drawer CSS lives at the end of
  `frontend/css/style.css` (`.cart-drawer`, `.cart-panel`, `.cart-item`, etc.).
- `pages/payment.html` computes the order total from the cart: card = full amount;
  cash = 5 ر.ق now with the remainder shown as "المبلغ المتبقي".
