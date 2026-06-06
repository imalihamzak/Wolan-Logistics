# Demo Setup

Run the backend demo seed after `MONGODB_URI` is set:

```bash
npm run seed:demo
```

Default test logins:

- Admin: `admin@wolan.com` / `password123`
- Merchant: `merchant@wolan.test` / `password123`
- Driver: `driver@wolan.test` / `password123`

The seed creates or refreshes:

- `Pioneer Mall Hub` with code `KLA-01`
- One active merchant with QR/referral data
- One active rider with a GPS fix
- One assigned pending order with a delivery OTP

Suggested test path:

1. Log in as the merchant at `/merchant-login` and create an order.
2. Log in as admin at `/login`, assign the order to the demo rider if needed, and inspect status history in Orders.
3. Log in as driver at `/driver-login`.
4. Accept the order, confirm pickup, link a physical tracker tag, move it to hub, start delivery, attach proof, and verify OTP.
5. For negative testing, attach proof and use failed delivery or return to merchant instead of OTP delivery.
