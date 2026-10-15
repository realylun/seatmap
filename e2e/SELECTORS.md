# E2E data-testid contract (public pages)

Admin specs use labels/roles on `src/app/admin/**`. Public pages must expose:

| testid                      | Where                | Notes                                                                                        |
| --------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `event-card`                | home (`/`), search   | `<a>` to `/events/[slug]`; every event card (trending + city)                                |
| `seat-map`                  | event detail         | the map container                                                                            |
| `fps-overlay`               | event detail         | FPS badge inside the map, text `NN fps · NN.N ms`; `data-level` = good / ok / poor / pending |
| `qty-chip-{n}`              | event detail filters | n = 1..8, click selects ticket quantity                                                      |
| `listing-card`              | event detail listing | one per listing; clicking auto-selects `n` (qty, default 1) contiguous cheapest seats        |
| `selected-seats-bar`        | event detail         | visible only when seats are selected                                                         |
| `selected-count`            | inside bar           | text contains the number of selected seats                                                   |
| `hold-button`               | inside bar           | calls `createHold`, navigates to `/checkout/[holdId]`                                        |
| `hold-error`                | event detail         | visible when createHold returns SEATS_TAKEN / other error                                    |
| `countdown`                 | checkout             | hold timer                                                                                   |
| `buyer-name`, `buyer-email` | checkout             | inputs                                                                                       |
| `pay-button`                | checkout             | submits `confirmOrder`, navigates to `/orders/[id]`                                          |
| `checkout-error`            | checkout             | visible on validation / expired errors                                                       |
| `order-id`                  | order page           | order code                                                                                   |
| `order-seats`               | order page           | list of seats; text contains seat labels                                                     |

Env: `E2E_BASE_URL` (default http://localhost:3000). Flows 2 and 3 use the first `event-card` on `/`
(seeded `on_sale` event with tiers assigned).
