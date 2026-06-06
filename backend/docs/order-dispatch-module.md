# Wolan Logistics Order & Dispatch Module

## Base Path
`/api/v1/orders`

## Table of Contents
1. [Create Order](#create-order)
2. [Batch Orders](#batch-orders)
3. [List Orders](#list-orders)
4. [Get Order](#get-order)
5. [Public Tracking](#public-tracking)
6. [Rider Tracking Lookup](#rider-tracking-lookup)
7. [Assign Rider](#assign-rider)
8. [Update Status](#update-status)
9. [OTP Verification](#otp-verification)
10. [Failed Delivery](#failed-delivery)
11. [Return To Merchant](#return-to-merchant)
12. [Socket Events](#socket-events)

---

## Create Order
POST `/`

Creates a new order with auto-generated tracking IDs, QR code, OTP, pickup key, and backend-calculated delivery pricing.

**Authentication:** Required (manager roles: super_admin, director, general_manager, coo, regional_manager, hub_manager, ops_coordinator, merchant)

**Request:**
```json
{
  "merchant_id": "69f437b4679645548c632462",
  "customer_name": "Rahul Verma",
  "customer_phone": "9876543210",
  "pickup_address": "Merchant shop, Kampala",
  "dropoff_address": "Ntinda Market, Kampala",
  "delivery_address": "Ntinda Market, Kampala",
  "pickup_coordinates": { "latitude": 0.3136, "longitude": 32.5811 },
  "dropoff_coordinates": { "latitude": 0.3476, "longitude": 32.5825 },
  "item_description": "Mobile phone",
  "declared_value": 14999,
  "hub_id": "66c0f1d7a8c1f10c2bd12345",
  "delivery_zone": "Zone A",
  "service_level": "standard",
  "cod_amount": 14999,
  "auto_assign": true
}
```

`delivery_fee` is not accepted in create-order payloads. The backend calculates it from the pickup/drop-off route distance using the configured map provider in production. For Wolan staging/live testing, set `MAP_PROVIDER=openrouteservice` and `OPENROUTESERVICE_API_KEY` so OpenRouteService handles geocoding, route distance, duration, and route geometry. Google Maps remains available as a fallback provider when `MAP_PROVIDER=google` and `GOOGLE_MAPS_API_KEY` is configured. Coordinates are an optional map override, not a merchant-entered delivery price.

## Estimate Delivery Pricing
POST `/pricing-estimate`

Returns the automatic delivery fee preview before order creation.

**Request:**
```json
{
  "pickup_address": "Merchant shop, Kampala",
  "dropoff_address": "Ntinda Market, Kampala",
  "pickup_coordinates": { "latitude": 0.3136, "longitude": 32.5811 },
  "dropoff_coordinates": { "latitude": 0.3476, "longitude": 32.5825 },
  "service_level": "express"
}
```

## Address Lookup
GET `/auth/maps/geocode?query=Pioneer%20Mall%20Kampala&limit=3`

Uses the configured map provider. With `MAP_PROVIDER=openrouteservice`, the backend calls OpenRouteService geocoding and returns sanitized address candidates only; the API key is never exposed to the frontend.

**Response:**
```json
{
  "results": [
    {
      "label": "Pioneer Mall, Kampala, Uganda",
      "address": "Pioneer Mall, Kampala, Uganda",
      "latitude": 0.3136,
      "longitude": 32.5811,
      "provider": "openrouteservice"
    }
  ],
  "provider": "openrouteservice"
}
```

**Response:**
```json
{
  "pricing": {
    "delivery_fee": 5000,
    "pricing_currency": "UGX",
    "pricing_distance_km": 2.4,
    "pricing_source": "openrouteservice_directions_driving-car",
    "pricing_tier_label": "1-3 KM",
    "service_level": "express",
    "express_requested": true
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "order": {
      "id": "...",
      "order_id": "ORD-XXXXX-XXXX",
      "package_tracking_id": "PKG-XXXXX-XXXX",
      "rider_tracking_id": "RDR-XXXXX-XXXX",
      "qr_code": "data:image/png;base64,...",
      "merchant_id": "...",
      "rider_id": "...",
      "customer_name": "Salma Naki",
      "customer_phone": "+256700000001",
      "delivery_address": "Ntinda Market, Kampala",
      "item_description": "Mobile phone",
      "declared_value": 14999,
      "order_status": "pending",
      "hub_id": "...",
      "delivery_zone": "Zone A",
      "delivery_fee": 5000,
      "pricing_currency": "UGX",
      "pricing_distance_km": 2.4,
      "pricing_tier_label": "1-3 KM",
      "service_level": "standard",
      "express_requested": false,
      "cod_amount": 14999,
      "picked_up_at": null,
      "at_hub_at": null,
      "out_for_delivery_at": null,
      "delivered_at": null,
      "failed_at": null,
      "returned_at": null,
      "otp_verified_at": null,
      "status_history": [...],
      "activity_logs": [...],
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

**Response Fields:**
| Field | Description |
|-------|-----------|
| order_id | Auto-generated unique order ID |
| package_tracking_id | Public tracking ID for customers |
| rider_tracking_id | Rider-specific tracking ID |
| qr_code | Base64 encoded QR code |
| otp_code | 6-digit OTP (internal, not in response) |
| *_at | Timestamps for each status change |
| status_history | Array of status changes with actor info |
| activity_logs | Detailed activity log |

---

## Batch Orders
POST `/batch`

Creates multiple orders in a single request.

**Authentication:** Required (manager roles: super_admin, director, general_manager, coo, regional_manager, hub_manager, ops_coordinator, merchant)

**Request:**
```json
{
  "orders": [
    {
      "merchant_id": "69f437b4679645548c632462",
      "customer_name": "Customer One",
      "customer_phone": "9876543210",
      "pickup_address": "Merchant shop, Kampala",
      "dropoff_address": "Delivery Address 1",
      "delivery_address": "Delivery Address 1",
      "pickup_coordinates": { "latitude": 0.3136, "longitude": 32.5811 },
      "dropoff_coordinates": { "latitude": 0.3476, "longitude": 32.5825 },
      "item_description": "Parcel 1",
      "declared_value": 1200,
      "hub_id": "66c0f1d7a8c1f10c2bd12345",
      "delivery_zone": "Zone A",
      "service_level": "standard",
      "cod_amount": 1200,
      "auto_assign": true
    },
    {
      "customer_name": "Customer Two",
      "customer_phone": "9876543211",
      "pickup_address": "Merchant shop, Kampala",
      "dropoff_address": "Delivery Address 2",
      "delivery_address": "Delivery Address 2",
      "pickup_coordinates": { "latitude": 0.3136, "longitude": 32.5811 },
      "dropoff_coordinates": { "latitude": 0.3476, "longitude": 32.5825 },
      "item_description": "Parcel 2",
      "declared_value": 800,
      "delivery_zone": "Zone B",
      "service_level": "express",
      "cod_amount": 800,
      "auto_assign": false
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Batch orders created successfully",
  "data": {
    "batch_id": "36XXXXXXXXXXXX-XXX",
    "orders": [...]
  }
}
```

---

## List Orders
GET `/`

Lists orders with filtering and pagination.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|------------|
| page | number | Page number (default: 1) |
| limit | number | Items per page (default: 10, max: 100) |
| search | string | Search in order_id, tracking IDs, customer name/phone, address |
| status | string | Filter by order_status |
| merchant_id | string | Filter by merchant |
| rider_id | string | Filter by rider |
| hub_id | string | Filter by hub |
| delivery_zone | string | Filter by zone |
| batch_id | string | Filter by batch |
| from | date | Created after date (ISO) |
| to | date | Created before date (ISO) |
| sort | string | Sort mode: 'zone', 'createdAt' (default) |

**Response (200):**
```json
{
  "success": true,
  "message": "Orders fetched successfully",
  "data": {
    "orders": [...]
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

---

## Get Order
GET `/:id`

Gets a single order by ID.

**Authentication:** Required

**Response (200):**
```json
{
  "success": true,
  "message": "Order fetched successfully",
  "data": { "order": {...} }
```

---

## Public Tracking
GET `/track/:packageTrackingId`

Public endpoint to track an order. No authentication required.

**Response (200):**
```json
{
  "success": true,
  "message": "Order tracking fetched successfully",
  "data": { "order": {...} }
}
```

---

## Rider Tracking Lookup
GET `/rider-tracking/:riderTrackingId`

Lookup order by rider tracking ID.

**Authentication:** Required

---

## Assign Rider
PATCH `/:id/assign-rider`

Manually assigns a rider or auto-assigns the nearest rider.

**Authentication:** Required (super_admin, hub_manager, ops_coordinator)

**Request:**
```json
{
  "rider_id": "66d0f1d7a8c1f10c2bd99999",
  "auto_assign": false,
  "note": "Manual dispatch"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Rider assigned successfully",
  "data": { "order": {...} }
}
```

**Auto-Assignment Logic:**
- Finds active riders in the same hub
- Scores by zone affinity and current load
- Returns the best match

---

## Update Status
PATCH `/:id/status`

Updates order status through the defined flow.

**Authentication:** Required (dispatch roles)

**Request:**
```json
{
  "order_status": "picked_up",
  "note": "Package picked up from merchant"
}
```

**Status Flow:**
```
pending → picked_up → at_hub → out_for_delivery → delivered
         ↓           ↓            ↓
       failed    returned    (terminal)
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": { "order": {...} }
}
```

---

## OTP Verification
POST `/:id/verify-otp`

Verifies delivery OTP and marks order as delivered.

**Authentication:** Required (dispatch roles)

**Request:**
```json
{
  "otp_code": "483921",
  "note": "OTP verified, package handed to customer"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP verified and order delivered successfully",
  "data": { "order": {...} }
}
```

**Notes:**
- OTP must match the 6-digit code generated for the order
- Once verified, order_status becomes "delivered"
- OTP is cleared after successful verification

---

## Failed Delivery
POST `/:id/failed`

Marks delivery as failed.

**Authentication:** Required (dispatch roles)

**Request:**
```json
{
  "reason": "Customer unreachable"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order marked as failed successfully",
  "data": { "order": {...} }
}
```

---

## Return To Merchant
POST `/:id/return-to-merchant`

Initiates return to merchant flow.

**Authentication:** Required (super_admin, hub_manager, ops_coordinator, merchant)

**Request:**
```json
{
  "reason": "Return requested after failed delivery"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Order returned to merchant successfully",
  "data": { "order": {...} }
}
```

**Notes:**
- Clears rider assignment
- Clears OTP code
- Sets status to "returned"

---

## Socket Events

The order system emits real-time events via Socket.IO:

| Event | Description | Emitted To |
|-------|-----------|----------|
| `order:created` | New order created | Hub, Merchant, Rider |
| `order:batch-created` | Batch orders created | Hub, Merchant |
| `order:assigned` | Rider assigned | Hub, Merchant, Rider |
| `order:status-updated` | Status changed | Hub, Merchant, Rider |
| `order:otp-verified` | OTP verified | Hub, Merchant, Rider |
| `order:failed` | Delivery failed | Hub, Merchant, Rider |
| `order:returned` | Returned to merchant | Hub, Merchant |

**Socket Rooms:**
- `hub:{hubId}` - All users in a hub
- `user:{userId}` - Specific user

---

## Order Schema

| Field | Type | Description |
|-------|------|------------|
| order_id | String | Unique order ID |
| merchant_id | ObjectId | Reference to Merchant |
| rider_id | ObjectId | Reference to Rider (nullable) |
| customer_name | String | Customer name |
| customer_phone | String | Customer phone |
| delivery_address | String | Full delivery address |
| item_description | String | Item description |
| declared_value | Number | Package declared value |
| order_status | String | Current status |
| otp_code | String | 6-digit OTP (internal) |
| package_tracking_id | String | Public tracking ID |
| rider_tracking_id | String | Rider tracking ID |
| qr_code | String | Base64 QR code |
| hub_id | ObjectId | Reference to Hub |
| delivery_zone | String | Delivery zone |
| delivery_fee | Number | Backend-calculated delivery fee |
| pricing_currency | String | Pricing currency, currently UGX |
| pricing_distance_km | Number | Configured map-provider route distance in KM |
| pricing_tier_label | String | Matched Wolan pricing band |
| service_level | String | standard or express |
| express_requested | Boolean | Whether 1-hour express service was requested |
| cod_amount | Number | COD amount |
| batch_id | String | Batch ID (for batch orders) |
| delivery_attempts | Number | Failed delivery attempts |
| failed_reason | String | Reason for failure |
| return_reason | String | Reason for return |
| assigned_at | Date | Rider assignment time |
| picked_up_at | Date | Pickup time |
| at_hub_at | Date | Arrival at hub |
| out_for_delivery_at | Date | Out for delivery |
| delivered_at | Date | Delivery time |
| failed_at | Date | Failure time |
| returned_at | Date | Return time |
| otp_verified_at | Date | OTP verification time |
| status_history | Array | Status change history |
| activity_logs | Array | Activity logs |

---

## Notes

1. **MongoDB Transactions:** All order modifications use sessions for atomicity
2. **Hub Isolation:** Orders are isolated by hub_id for multi-hub setup
3. **Status History:** Every status change is recorded with actor info
4. **Activity Logs:** Detailed logging for audit trail
5. **QR Code:** Contains order data for scanning
6. **Auto Assignment:** Uses zone affinity and load balancing
7. **OTP:** 6-digit random code, regenerated per order
