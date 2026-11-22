# KAYAN AI plans and Yemeni wallet payments

## Public prices

The KAYAN catalogue uses the same public price points as the referenced four-tier competitor:

| Plan | Monthly | Annual |
|---|---:|---:|
| Free | $0 | $0 |
| Starter | $9 | $90 |
| Pro | $29 | $290 |
| Business | $59 | $590 |

Annual billing charges ten monthly payments for twelve months. The catalogue maps these prices to the existing KAYAN subscription tiers: `trial`, `starter`, `growth`, and `pro`. KAYAN quotas remain based on KAYAN's own server-side entitlements rather than copying features it does not currently provide.

## Esaalat merchant configuration

Wallet checkout remains disabled until all of the following server environment variables are configured:

- `ESAALAT_CLIENT_ID`: merchant API client ID.
- `ESAALAT_CLIENT_SECRET`: merchant API client secret.
- `ESAALAT_WEBHOOK_SECRET`: secret generated when registering the webhook endpoint.
- `YER_PER_USD`: operator-approved USD to YER conversion rate used to calculate the whole-riyal amount.

Never expose these values in browser variables.

### Merchant setup

1. Create Esaalat merchant API credentials in the Esaalat dashboard.
2. Add at least one receiving wallet to the merchant account.
3. Install and enroll the Esaalat Android monitoring app on the phone holding that wallet SIM, and keep monitoring enabled.
4. Register a public HTTPS webhook URL: `/api/billing/esaalat-webhook`.
5. Copy the webhook secret into `ESAALAT_WEBHOOK_SECRET`.
6. Set `YER_PER_USD` to the approved merchant conversion rate. KAYAN does not silently fetch or invent a foreign-exchange rate.
7. Test the complete payment and webhook flow with Esaalat's isolated test wallet before enabling real collections.

Only wallets returned by Esaalat's active receiving-wallet endpoint are offered in KAYAN. This normally excludes inactive wallets and wallets without an enabled monitoring device.

## Payment activation

KAYAN creates a pending payment intent, sends the user to Esaalat's hosted checkout, and waits for the signed `payment.verified` webhook. The backend checks the order ID, provider intent ID, wallet, YER currency and exact whole-riyal amount in a database transaction before activating the selected subscription. Duplicate events are idempotent. A wrong amount or mismatched wallet does not activate the subscription.

Esaalat verifies wallet transfers; it is not a bank or a wallet provider, and funds move directly from the customer's wallet to the merchant's wallet. Provider availability depends on the wallets configured and monitored in the merchant account.
