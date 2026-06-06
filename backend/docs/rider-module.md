# Wolan Logistics Rider Module

## Base Path
`/api/v1/riders`

## Authentication
All rider endpoints require authentication via JWT token in the Authorization header.
Role-based access control is enforced on most endpoints.

## Rider Registration
POST `/register`

Request:
```json
{
  "full_name": "John Doe",
  "phone": "9876543210",
  "hub_id": "66c0f1d7a8c1f10c2bd12345",
  "bike_plate": "KA 01 AB 1234",
  "nin_number": "ABC123456",
  "next_of_kin": {
    "name": "Jane Doe",
    "phone": "9876543211",
    "relationship": "Spouse"
  },
  "bond_amount": 5000
}
```

Response:
```json
{
  "success": true,
  "message": "Rider profile created successfully",
  "data": {
    "rider": {
      "id": "...",
      "user_id": "...",
      "full_name": "John Doe",
      "phone": "9876543210",
      "bike_plate": "KA 01 AB 1234",
      "current_status": "offline",
      "hub_id": "...",
      "is_active": true
    }
  }
}
```

## Get My Profile
GET `/me`
Protected: rider role

## Update Status
POST `/me/status`
Protected: rider role

Request:
```json
{
  "current_status": "available"
}
```

Allowed statuses: `available`, `on_delivery`, `break`, `offline`

## Update GPS Location
POST `/me/location`
Protected: rider role

Request:
```json
{
  "latitude": 12.9716,
  "longitude": 77.5946
}
```

Response includes `gps_location` and `last_location_update`.

## Upload Document
POST `/me/document`
Protected: rider role

Request:
```json
{
  "document_type": "license",
  "url": "https://cloudinary.com/...",
  "public_id": "..."
}
```

Document types: `license`, `insurance`, `bike_registration`, `id_card`, `other`

## Register Bond Payment
POST `/me/bond`
Protected: rider role

Request:
```json
{
  "bond_amount": 5000
}
```

## Get Fines
GET `/me/fines`
Protected: rider role

## Pay Fine
POST `/me/fines/:fineId/pay`
Protected: rider role

## Report Incident
POST `/me/incident`
Protected: rider role

Request:
```json
{
  "type": "accident",
  "description": "Minor collision at intersection",
  "location": "MG Road, Bengaluru"
}
```

Incident types: `accident`, `theft`, `complaint`, `lost_package`, `damage`, `medical`, `other`

## Get Incidents
GET `/me/incidents`
Protected: rider role

## Get Daily Summary
GET `/me/daily-summary`
Protected: rider role

Optional query:
```json
{
  "date": "2024-01-15"
}
```

## Get Earnings
GET `/me/earnings`
Protected: rider role

Query parameters:
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)

## List All Riders (Admin)
GET `/`
Protected: super_admin, hub_manager, ops_coordinator

Query parameters:
- `page`, `limit`
- `search`: Search by name, phone, bike plate
- `hub_id`: Filter by hub
- `current_status`: Filter by status
- `is_active`: Filter by active status

## Get Rider By ID (Admin)
GET `/:id`
Protected: super_admin, hub_manager, ops_coordinator

## Get Rider Earnings (Admin)
GET `/:id/earnings`
Protected: super_admin, hub_manager, ops_coordinator

## Verify Document (Admin)
PATCH `/:id/document`

Request:
```json
{
  "document_type": "license",
  "verified": true
}
```

## Update Performance (Admin)
PATCH `/:id/performance`
Protected: super_admin, hub_manager, ops_coordinator

## Issue Fine (Admin)
POST `/:id/fine`
Protected: super_admin, hub_manager, ops_coordinator

Request:
```json
{
  "amount": 500,
  "reason": "Traffic violation"
}
```

## Resolve Incident (Admin)
PATCH `/:id/incident/:incidentId/resolve`
Protected: super_admin, hub_manager, ops_coordinator

Request:
```json
{
  "resolution": "Resolved with warning"
}
```

## Socket Events
- `rider:status-updated` - Emitted when rider changes status
- `rider:location-updated` - Emitted when GPS location updates
- `rider:fine-added` - Emitted when fine is issued
- `rider:incident-reported` - Emitted when incident is reported

## Notes
1. Riders must register a profile before accepting orders
2. GPS location updates automatically set status to 'available' if was offline
3. Documents must be verified by admin before rider can operate
4. Performance score is calculated based on 30-day delivery history
5. Fines are deducted from pending payouts
6. All earnings calculations use 50 INR per successful delivery
