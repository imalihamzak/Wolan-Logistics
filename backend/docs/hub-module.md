# Wolan Logistics Hub Module

## Base Path
`/api/v1/hubs`

## Table of Contents
1. [Create Hub](#create-hub)
2. [List Hubs](#list-hubs)
3. [Get Hub](#get-hub)
4. [Update Hub](#update-hub)
5. [Suspend/Activate Hub](#suspendactivate-hub)
6. [Assign Manager](#assign-manager)
7. [Hub Analytics](#hub-analytics)
8. [HQ Dashboard](#hq-dashboard)
9. [Reports](#reports)

---

## Create Hub
POST `/hubs`

Creates a new hub for multi-location operations.

**Authentication:** Required (HQ roles: super_admin, director, general_manager)

**Request:**
```json
{
  "name": "Pioneer Mall Hub",
  "code": "HUB_001",
  "address": "Pioneer Mall, Kampala CBD",
  "city": "Kampala",
  "state": "Central",
  "country": "Uganda",
  "zone": "CBD",
  "manager_id": "66d0f1d7a8c1f10c2bd11111",
  "contact_phone": "+256761253001",
  "contact_email": "pioneer@wolan.com",
  "operating_hours": {
    "open": "08:00",
    "close": "20:00"
  },
  "coordinates": {
    "latitude": 0.3136,
    "longitude": 32.5811
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Hub created successfully",
  "data": {
    "hub": {
      "_id": "...",
      "name": "Pioneer Mall Hub",
      "code": "HUB_001",
      "address": "...",
      "city": "Kampala",
      "state": "Central",
      "zone": "CBD",
      "manager_id": "...",
      "is_active": true,
      "contact_phone": "+256761253001",
      "contact_email": "pioneer@wolan.com",
      "operating_hours": {
        "open": "08:00",
        "close": "20:00"
      },
      "coordinates": {
        "latitude": 0.3136,
        "longitude": 32.5811
      },
      "total_orders": 0,
      "total_revenue": 0,
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

**Hub Fields:**
| Field | Type | Description |
|-------|------|------------|
| name | String | Hub name |
| code | String | Unique code (uppercase) |
| address | String | Full address |
| city | String | City |
| state | String | State |
| country | String | Country (default: Uganda) |
| zone | String | Operational zone |
| manager_id | ObjectId | Hub manager user |
| is_active | Boolean | Active status |
| contact_phone | String | Contact phone |
| contact_email | String | Contact email |
| operating_hours | Object | Operating hours |
| coordinates | Object | GPS coordinates |
| total_orders | Number | Total orders processed |
| total_revenue | Number | Total revenue |

---

## List Hubs
GET `/hubs`

Lists all hubs with filtering and pagination.

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|------------|
| page | number | Page number |
| limit | number | Items per page |
| search | string | Search in name, code, city |
| is_active | boolean | Filter by active status |
| city | string | Filter by city |
| state | string | Filter by state |

**Response (200):**
```json
{
  "success": true,
  "message": "Hubs fetched successfully",
  "data": {
    "hubs": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1
    }
  }
}
```

**Access Control:**
- Super admin: Sees all hubs
- Hub manager: Sees only assigned hub

---

## Get Hub
GET `/hubs/:id`

Gets hub details.

**Authentication:** Required

**Response (200):**
```json
{
  "success": true,
  "message": "Hub fetched successfully",
  "data": {
    "hub": {...}
  }
}
```

---

## Update Hub
PATCH `/hubs/:id`

Updates hub information.

**Authentication:** Required (hub_manager for own hub, HQ roles for all permitted hubs)

**Request:**
```json
{
  "name": "Pioneer Mall Hub - Updated",
  "contact_phone": "+256761253001",
  "operating_hours": {
    "open": "07:00",
    "close": "22:00"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Hub updated successfully",
  "data": {
    "hub": {...}
  }
}
```

---

## Suspend/Activate Hub
POST `/hubs/:id/suspend`

Suspends or activates a hub.

**Authentication:** Required (super_admin only)

**Request:**
```json
{
  "is_active": false,
  "reason": "Maintenance required"
}
```

**Notes:**
- When suspending, all users in hub are deactivated
- Activating restores user access

**Response (200):**
```json
{
  "success": true,
  "message": "Hub suspended successfully",
  "data": {
    "hub": {...}
  }
}
```

---

## Assign Manager
POST `/hubs/:id/assign-manager`

Assigns or unassigns a hub manager.

**Authentication:** Required (super_admin only)

**Request:**
```json
{
  "manager_id": "66d0f1d7a8c1f10c2bd11111"
}
```

**Unassign (remove manager):**
```json
{
  "manager_id": null
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Manager assigned successfully",
  "data": {
    "hub": {...}
  }
}
```

---

## Hub Analytics
GET `/hubs/:id/analytics`

Gets comprehensive analytics for a hub.

**Authentication:** Required (hub_manager, ops_coordinator)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|------------|
| period | number | Days for analytics (default: 30) |

**Response (200):**
```json
{
  "success": true,
  "message": "Hub analytics fetched successfully",
  "data": {
    "hub": {
      "id": "...",
      "name": "Pioneer Mall Hub",
      "code": "HUB_001",
      "city": "Kampala"
    },
    "delivery_stats": {
      "total_orders": 150,
      "total_value": 250000,
      "total_delivery_fee": 15000,
      "total_cod": 180000,
      "status_breakdown": [...]
    },
    "performance": {
      "period": 30,
      "total_days": 30,
      "total_orders": 150,
      "total_revenue": 15000,
      "total_cod": 180000,
      "avg_orders_per_day": 5,
      "avg_revenue_per_day": 500,
      "daily_data": [...]
    },
    "rider_stats": {
      "summary": {
        "total_riders": 10,
        "active_riders": 8,
        "total_completed": 120,
        "total_active": 15
      },
      "riders": [...]
    },
    "merchant_stats": {
      "summary": {
        "total_merchants": 25,
        "total_orders": 150,
        "total_delivered": 130
      },
      "merchants": [...]
    },
    "revenue": {
      "delivery_revenue": 15000,
      "cod_collected": 180000,
      "transactions": {...}
    },
    "zone_performance": [...],
    "order_funnel": {
      "total": 150,
      "stages": [
        { "_id": "pending", "count": 20, "conversion_rate": 1 },
        { "_id": "picked_up", "count": 15, "conversion_rate": 0.75 },
        { "_id": "at_hub", "count": 14, "conversion_rate": 0.93 },
        { "_id": "out_for_delivery", "count": 12, "conversion_rate": 0.86 },
        { "_id": "delivered", "count": 10, "conversion_rate": 0.83 }
      ]
    }
  }
}
```

---

## HQ Dashboard
GET `/hq/dashboard`

Gets HQ-level dashboard across all hubs.

**Authentication:** Required (super_admin, ops_coordinator)

**Response (200):**
```json
{
  "success": true,
  "message": "HQ dashboard fetched successfully",
  "data": {
    "summary": {
      "total_hubs": 5,
      "total_orders": 500,
      "status_breakdown": {
        "pending": 50,
        "picked_up": 30,
        "at_hub": 20,
        "out_for_delivery": 15,
        "delivered": 350,
        "failed": 25,
        "returned": 10
      },
      "active_riders": 45,
      "active_merchants": 120
    },
    "hub_comparison": [
      {
        "hub_name": "Pioneer Mall Hub",
        "hub_code": "HUB_001",
        "total_orders": 150,
        "delivered": 130,
        "failed": 10,
        "revenue": 15000,
        "cod": 180000
      },
      ...
    ]
  }
}
```

---

## Reports

### Delivery Report
GET `/hubs/:id/delivery-report`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|------------|
| from | date | Start date (ISO) |
| to | date | End date (ISO) |
| period | number | Days (default: 30) |

### Rider Report
GET `/hubs/:id/rider-report`

Gets detailed rider performance report.

### Time Series
GET `/hubs/:id/time-series`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|------------|
| from | date | Start date |
| to | date | End date |
| granularity | string | day/hour/week/month |

---

## Role-Based Access

| Role | Create Hub | List All | Own Hub | Analytics | HQ Dashboard |
|------|-----------|---------|--------|---------|-------------|
| super_admin | ✓ | ✓ | ✓ | ✓ | ✓ |
| hub_manager | ✗ | ✗ | ✓ | ✓ | ✗ |
| ops_coordinator | ✗ | ✓ | ✗ | ✓ | ✓ |

---

## Notes

1. **Multi-Hub Architecture:** Each hub operates independently with its own riders and merchants
2. **Hub Isolation:** Order data is filtered by hub_id
3. **Centralized HQ View:** Super admin sees all hubs with comparison data
4. **Zone-Based Sorting:** Orders can be sorted by delivery_zone
5. **Analytics:** MongoDB aggregations for real-time insights
