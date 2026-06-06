# Wolan Logistics Merchant Module

## Base Path
`/api/v1/merchants`

## Merchant Registration
POST `/register`

Request:
```json
{
  "merchant_name": "Amit Kumar",
  "shop_name": "Amit Electronics",
  "building_name": "Riverside Plaza",
  "phone": "9876543210",
  "email": "amit@merchant.com",
  "password": "MerchantPass123!",
  "address": "12 MG Road, Bengaluru",
  "referred_by": "WOLAN7FA2",
  "hub_id": "66c0f1d7a8c1f10c2bd12345",
  "status": "active"
}
```

Response:
```json
{
  "success": true,
  "message": "Merchant registered successfully",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "merchant": {
      "id": "...",
      "merchant_name": "Amit Kumar",
      "shop_name": "Amit Electronics",
      "referral_code": "WOLAN7FA2",
      "tier_level": "Starter",
      "cod_balance": 0,
      "earnings": 0,
      "status": "active"
    }
  }
}
```

## Merchant Login
POST `/login`

Request:
```json
{
  "email": "amit@merchant.com",
  "password": "MerchantPass123!"
}
```

## Forgot Password
POST `/forgot-password`

Request:
```json
{
  "email": "amit@merchant.com"
}
```

## Reset Password
POST `/reset-password/:resetToken`

Request:
```json
{
  "password": "NewMerchantPass123!",
  "confirm_password": "NewMerchantPass123!"
}
```

## Change Password
PATCH `/change-password`

Request:
```json
{
  "current_password": "MerchantPass123!",
  "password": "NewMerchantPass123!",
  "confirm_password": "NewMerchantPass123!"
}
```

## Dashboard
GET `/dashboard`

Headers:
```http
Authorization: Bearer <accessToken>
```

## Referral Earnings
GET `/referral-earnings?page=1&limit=10`

## COD Reports
GET `/cod-reports?page=1&limit=10&from=2026-04-01&to=2026-05-01`

## Payout History
GET `/payout-history?page=1&limit=10`

## QR Code
GET `/qr-code`

POST `/:id/qr-code` regenerates the QR code for admin users.

## Postman Notes
1. Save `accessToken` and `refreshToken` after login/register.
2. Use `Authorization: Bearer <accessToken>` for protected requests.
3. Enable cookies if you want refresh-token rotation through the browser or Postman cookie jar.
4. Use the list endpoint with `search`, `status`, `tier_level`, `hub_id`, `page`, and `limit` query parameters for filtering and pagination.