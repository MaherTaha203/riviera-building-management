# Automatic exchange rates (USD→ILS, JOD→ILS)

The header FX chips and the voucher/cheque "سعر الصرف" prefills read a single
endpoint: `GET /api/settings/exchange-rates`. That endpoint now serves a **live,
automatically-fetched** market rate, falling back to a **stored manual rate**
whenever the live source is unavailable.

## How it works

| Layer | Behaviour |
| --- | --- |
| Live source | `lib/fx.ts` fetches from a free, no-key FX API (base USD) and caches the result in memory. `usdToILS = rates.ILS`, `jodToILS = rates.ILS / rates.JOD`. |
| Refresh | Once every 24h by default (rates vs. the shekel move slowly). One in-flight request is de-duped; a stale cache keeps serving if a refresh fails. |
| Fallback | If auto-fetch is disabled, the upstream is unreachable, or the payload is invalid, the endpoint returns the **stored** `exchange_rates` row — the value editable in **Settings → أسعار الصرف**. Nothing breaks; the app just shows the last manual value. |
| `source` field | The endpoint response includes `source: "auto" \| "manual"` so the header can show an honest live-vs-manual indicator (green pulsing dot = live). |
| Frontend | The header refetches every 30 min (and on window focus) so a long-open tab stays current. No manual reload needed. |

The stored DB row is **never overwritten** by the live fetch — it stays as the
admin-controlled fallback. Editing it in Settings only changes what shows when
the live fetch is unavailable.

## Configuration (server environment)

| Variable | Default | Effect |
| --- | --- | --- |
| `FX_AUTO` | on | Set to `0`/`false`/`no`/`off` to disable auto-fetch entirely (pure manual, the old behaviour). |
| `FX_REFRESH_MS` | `86400000` (24h) | Cache TTL in milliseconds. |
| `FX_SOURCE_URL` | `https://open.er-api.com/v6/latest/USD` | Upstream URL (must be a "base USD" payload with `rates.ILS` and `rates.JOD`). |

## Production note

The live fetch requires outbound HTTPS from the API host (Render) to the FX
source. Render's free tier allows outbound HTTPS, so no configuration is needed
— but if egress is ever blocked, the endpoint transparently falls back to the
stored manual rate. To verify the live path is active, check the API logs for
`fx: live rates refreshed`, or hover the header FX chips (a green pulsing dot
and the tooltip "سعر صرف مباشر" mean the live rate is being served).
