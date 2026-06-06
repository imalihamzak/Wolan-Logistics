# Wolan Logistics Realtime Tracking Module

## Overview

The realtime tracking module provides live updates for riders, orders, and admin dashboards using Socket.IO.

## Base Path

WebSocket connection at the server URL.

## Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: 'JWT_TOKEN' },
  query: { token: 'JWT_TOKEN' }
});
```

## Authentication

- JWT token in `auth.token` or `query.token`
- If no token, limited public tracking only

## Rooms

| Room | Description |
|------|-------------|
| `admin` | All admin users |
| `merchants` | All merchants |
| `riders` | All riders |
| `hub:{hub_id}` | Specific hub |
| `merchant:{merchant_id}` | Specific merchant |
| `rider:{rider_id}` | Specific rider |
| `user:{user_id}` | Specific user |
| `order:{order_id}` | Order tracking |

## Socket Events

### Client → Server (Emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `rider:update-location` | `{ latitude, longitude, accuracy }` | Update rider GPS |
| `rider:online` | - | Announce online |
| `rider:offline` | - | Announce offline |
| `join:hub` | `hubId` | Join hub room |
| `join:merchant` | `merchantId` | Join merchant room |
| `join:rider` | `riderId` | Join rider room |
| `subscribe:order` | `orderId` | Subscribe to order |
| `unsubscribe:order` | `orderId` | Unsubscribe |
| `request:hub-riders` | `hubId` (callback) | Get hub riders |
| `request:dashboard` | callback | Get dashboard data |
| `ping` | - | Keep-alive |

### Server → Client (Listen)

#### Rider Events

| Event | Payload | Description |
|-------|---------|-------------|
| `rider-location-update` | `{ rider_id, latitude, longitude, timestamp }` | Location update |
| `rider-online` | `{ rider_id, hub_id, timestamp }` | Rider came online |
| `rider-offline` | `{ rider_id, hub_id, timestamp }` | Rider went offline |
| `rider-gone-offline` | `{ rider_id, hub_id, message }` | Alert: Offline during delivery |

#### Order Events

| Event | Payload | Description |
|-------|---------|-------------|
| `new-order` | Order data | New order created |
| `order-status-update` | `{ order_id, order_status, previous_status }` | Status changed |
| `order-delivered` | Order data | Order delivered |
| `order-failed` | Order data | Delivery failed |
| `order-out-for-delivery` | Order data | Out for delivery |
| `order-returned` | Order data | Returned to merchant |
| `rider-assigned` | `{ order_id, rider_id }` | Rider assigned |
| `live-tracking-update` | Live updates | Live order tracking |

#### Admin Events

| Event | Payload | Description |
|-------|---------|-------------|
| `dashboard-counters` | Total counts | Live dashboard data |
| `package-alert` | Alert data | Package alerts |
| `delivery-notification` | Notification | Delivery notifications |
| `batch-created` | Batch data | Batch order created |
| `zone-update` | Zone sorting | Zone updates |

## Feature: Live Rider Location Tracking

### Request Location Update

```javascript
socket.emit('rider:update-location', {
  latitude: 12.9716,
  longitude: 77.5946,
  accuracy: 10,
  timestamp: new Date()
});
```

### Receive Location Update

```javascript
socket.on('rider-location-update', (data) => {
  console.log(data.rider_id, data.latitude, data.longitude);
});
```

## Feature: Live Package Tracking

### Subscribe to Order

```javascript
socket.emit('subscribe:order', 'ORD-XXXXX');
socket.on('live-tracking-update', (data) => {
  console.log(data.order_id, data.status);
});
```

## Feature: Realtime Order Status Updates

Orders automatically emit status updates to relevant rooms.

```javascript
socket.on('order-status-update', (data) => {
  console.log(data.package_tracking_id, data.order_status);
});
```

## Feature: Rider Online/Offline Events

```javascript
socket.on('rider-online', (data) => {
  console.log(`Rider ${data.rider_id} is online`);
});

socket.on('rider-offline', (data) => {
  console.log(`Rider ${data.rider_id} is offline`);
});
```

## Feature: Admin Dashboard Live Counters

```javascript
// Request dashboard data
socket.emit('request:dashboard', (response) => {
  console.log(response.counters);
});

// Or listen for updates
socket.on('dashboard-counters', (counters) => {
  console.log(counters.total_orders, counters.delivered);
});
```

Counter fields:
- `total_orders`
- `pending_orders`
- `in_transit`
- `delivered`
- `failed`
- `returned`
- `active_riders`
- `online_riders`
- `total_merchants`

## Feature: Package & Rider Mismatch Alerts

```javascript
socket.on('package-alert', (alert) => {
  console.log(alert.type, alert.message);
});
```

Alert types:
- `rider_overload`
- `delivery_failed`
- `returned_to_merchant`

## Feature: Delivery Notifications

```javascript
socket.on('delivery-notification', (notification) => {
  console.log(notification.type, notification.message);
});
```

## Example: Complete Rider Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: riderJwtToken }
});

// Connect
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  
  // Announce online
  socket.emit('rider:online');
  
  // Start location updates
  setInterval(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      socket.emit('rider:update-location', {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      });
    });
  }, 5000);
});

// Listen for new orders
socket.on('new-order', (order) => {
  console.log('New order received:', order.package_tracking_id);
});

// Handle disconnect
socket.on('disconnect', () => {
  socket.emit('rider:offline');
});
```

## Example: Complete Admin Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: adminJwtToken }
});

socket.on('connect', () => {
  // Join admin room (auto-joined on auth)
  
  // Request initial dashboard
  socket.emit('request:dashboard', (data) => {
    console.log(data.counters);
  });
});

// Listen for all events
socket.on('dashboard-counters', (counters) => updateDashboard(counters));
socket.on('new-order', (order) => addOrderToList(order));
socket.on('order-status-update', (update) => updateOrderStatus(update));
socket.on('package-alert', (alert) => showAlert(alert));
socket.on('rider-online', (data) => updateRiderStatus(data, 'online'));
socket.on('rider-offline', (data) => updateRiderStatus(data, 'offline'));
socket.on('rider-location-update', (loc) => updateRiderMap(loc));
```

## Scaling Configuration

Environment variables:
- `SOCKET_CORS_ORIGIN` - Allowed origins
- `SOCKET_PING_INTERVAL` - Keep-alive interval (ms)
- `SOCKET_PING_TIMEOUT` - Connection timeout (ms)
- `SOCKET_MAX_PAYLOAD` - Max message size
- `SOCKET_MAX_CONNECTIONS` - Max concurrent connections

## Notes

1. Riders auto-announce online on connection
2. All events include timestamps
3. Admin gets all events regardless of hub
4. Merchants only get their orders
5. Riders only get their assigned orders
6. Hub managers get hub-specific events
