# Wolan Logistics Backend

Production-ready backend for Wolan Logistics - A complete delivery and dispatch management system.

## 📁 Final Folder Structure

```
backend-wolan/
├── app.js                        # Express app configuration
├── server.js                     # Server entry point with graceful shutdown
├── package.json                  # Dependencies and scripts
├── .env                       # Environment variables (template)
├── config/
│   ├── db.js                  # MongoDB connection
│   └── socket.js              # Socket.IO configuration
├── controllers/
│   ├── authController.js       # Authentication handlers
│   ├── healthController.js  # Health check
│   ├── hubController.js  # Hub management
│   ├── merchantController.js # Merchant management
│   ├── orderController.js # Order & dispatch
│   ├── riderController.js # Rider management
│   ├── shipmentController.js
│   └── uploadController.js
├── middleware/
│   ├── authMiddleware.js    # JWT authentication
│   ├── errorHandler.js  # Global error handling
│   ├── hubMiddleware.js
│   ├── notFound.js    # 404 handler
│   ├── roleMiddleware.js # Role authorization
│   └── validateRequest.js # Request validation
├── models/
│   ├── Hub.js
│   ├── Merchant.js
│   ├── MerchantTransaction.js
│   ├── Notification.js
│   ├── Order.js
│   ├── Rider.js
│   ├── Shipment.js
│   ├── Upload.js
│   └── User.js
├── routes/
│   ├── index.js           # Route aggregator
│   ├── authRoutes.js
│   ├── healthRoutes.js
│   ├── hubRoutes.js
│   ├── merchantRoutes.js
│   ├── orderRoutes.js
│   ├── riderRoutes.js
│   ├── shipmentRoutes.js
│   └── uploadRoutes.js
├── services/
│   ├── hubAnalyticsService.js
│   ├── merchantService.js
│   ├── orderService.js
│   ├── realtimeService.js
│   └── riderService.js
├── sockets/
│   ├── index.js
│   ├── emitters.js
│   ├── handlers/
│   │   ├── adminHandlers.js
│   │   ├── orderHandlers.js
│   │   └── riderHandlers.js
│   └── middleware/
│       └── authMiddleware.js
├── utils/
│   ├── AppError.js
│   ├── asyncHandler.js
│   ├── notificationTemplates.js
│   ├── response.js
│   ├── token.js
│   └── upload.js
├── validation/
│   ├── authValidation.js
│   ├── hubValidation.js
│   ├── merchantValidation.js
│   ├── orderValidation.js
│   └── riderValidation.js
└── docs/
    ├── auth-module.md
    ├── hub-module.md
    ├── merchant-module.md
    ├── order-dispatch-module.md
    ├── realtime-tracking-module.md
    └── rider-module.md
```

## 🚀 Installation Commands

```bash
# 1. Navigate to project directory
cd backend-wolan

# 2. Install dependencies
npm install

# 3. Create .env file
cp .env.example .env

# 4. Configure environment variables
# Edit .env with your MongoDB URI and JWT secret
```

## ⚙️ Environment Variables (.env)

```env
# Required
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/wolan
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Server
PORT=5000

# Security (production)
JWT_EXPIRE=7d
JWT_COOKIE_EXPIRE=7
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CLIENT_ORIGIN=http://localhost:3000
SOCKET_CORS_ORIGIN=http://localhost:3000

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

# Optional (production)
# LOG_DIR=./logs

# Automatic delivery pricing
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
GOOGLE_DISTANCE_TIMEOUT_MS=8000
PRICING_REQUIRE_GOOGLE_MAPS=true
```

## 📦 Package.json

```json
{
  "name": "wolan-logistics-backend",
  "version": "1.0.0",
  "description": "Production-ready backend for Wolan Logistics",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "lint": "node --check app.js && node --check server.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0",
    "helmet": "^8.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.13.2",
    "morgan": "^1.10.0",
    "multer": "^1.4.5-lts.2",
    "qrcode": "^1.5.4",
    "socket.io": "^4.8.1"
  },
  "devDependencies": {
    "nodemon": "^3.1.9"
  }
}
```

## 🔧 Server Startup Commands

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# With PM2
pm2 start server.js --name wolan-backend
pm2 logs wolan-backend
pm2 stop wolan-backend

# With Docker
docker build -t wolan-backend .
docker run -p 5000:5000 -e MONGODB_URI=mongodb://host:27017/wolan wolan-backend
```

## 🧪 Testing Instructions

### Using cURL

```bash
BASE_URL=http://localhost:5000/api/v1

# Health Check
curl $BASE_URL/health

# Register User
curl -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wolan.com","password":"password123","role":"super_admin","full_name":"Admin"}'

# Login
curl -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@wolan.com","password":"password123"}'

# Create Order (with token)
curl -X POST $BASE_URL/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name":"John Doe",
    "customer_phone":"9876543210",
    "pickup_address":"Merchant shop, Kampala",
    "dropoff_address":"123 Main St",
    "delivery_address":"123 Main St",
    "pickup_coordinates":{"latitude":0.3136,"longitude":32.5811},
    "dropoff_coordinates":{"latitude":0.3476,"longitude":32.5825},
    "item_description":"Package",
    "declared_value":500,
    "hub_id":"HUB_ID",
    "delivery_zone":"Zone A",
    "service_level":"standard",
    "cod_amount":500
  }'
```

Delivery fees are calculated by the backend from pickup/drop-off location distance. In production, `GOOGLE_MAPS_API_KEY` is required so the API can geocode addresses when GPS coordinates are not supplied and then calculate the route distance with Google Maps Distance Matrix. Clients must not submit `delivery_fee`; use the pricing estimate endpoint first when the UI needs a preview. GPS coordinates are only an optional override for already-resolved map locations.

### Postman Collection Structure

```
Wolan Logistics Backend/
├── Authentication/
│   ├── POST /api/v1/auth/register
│   ├── POST /api/v1/auth/login
│   ├── POST /api/v1/auth/logout
│   └── GET  /api/v1/auth/me
├── Health/
│   └── GET /api/v1/health
├── Hubs/
│   ├── GET    /api/v1/hubs
│   ├── POST   /api/v1/hubs
│   ├── GET    /api/v1/hubs/:id
│   ├── PUT    /api/v1/hubs/:id
│   └── GET    /api/v1/hubs/:id/analytics
├── Merchants/
│   ├── GET    /api/v1/merchants
│   ├── POST   /api/v1/merchants
│   ├── GET    /api/v1/merchants/:id
│   ├── PUT    /api/v1/merchants/:id
│   └── GET    /api/v1/merchants/:id/orders
├── Orders/
│   ├── GET    /api/v1/orders
│   ├── POST   /api/v1/orders
│   ├── POST   /api/v1/orders/batch
│   ├── GET    /api/v1/orders/track/:packageTrackingId
│   ├── GET    /api/v1/orders/:id
│   ├── PATCH  /api/v1/orders/:id/assign-rider
│   ├── PATCH  /api/v1/orders/:id/status
│   ├── POST   /api/v1/orders/:id/verify-otp
│   ├── POST   /api/v1/orders/:id/failed
│   └── POST   /api/v1/orders/:id/return-to-merchant
├── Riders/
│   ├── GET    /api/v1/riders
│   ├── POST   /api/v1/riders
│   ├── GET    /api/v1/riders/:id
│   ├── PATCH  /api/v1/riders/:id/status
│   ├── GET    /api/v1/riders/:id/orders
│   └── GET    /api/v1/riders/nearby
└── Socket Events/
    ├── order:created
    ├── order:assigned
    ├── order:status-updated
    ├── order:otp-verified
    ├── order:failed
    ├── order:returned
    └── rider:location-updated
```

## 📱 API Endpoints Summary

| Module | Base Path | Methods |
|--------|----------|---------|
| Auth | `/api/v1/auth` | POST register, login, logout, GET me |
| Health | `/api/v1/health` | GET |
| Hubs | `/api/v1/hubs` | GET, POST |
| Merchants | `/api/v1/merchants` | GET, POST |
| Orders | `/api/v1/orders` | GET, POST, PATCH |
| Riders | `/api/v1/riders` | GET, POST, PATCH |
| Shipments | `/api/v1/shipments` | GET, POST |
| Uploads | `/api/v1/uploads` | POST |

## 🔐 Security Features

- JWT Authentication
- Role-based Access Control (RBAC)
- Rate Limiting
- CORS Configuration
- Helmet Security Headers
- Input Validation
- SQL/MongoDB Injection Prevention
- Password Encryption (bcrypt)
- Secure Cookies

## ⚡ Performance Optimizations

- MongoDB Indexes on frequently queried fields
- Keep-Alive Headers
- Connection Pooling
- Request Compression
- Pagination
- Socket.IO for Real-time Updates

## 🔌 WebSocket Events

### Order Events
- `order:created` - New order created
- `order:batch-created` - Batch orders created
- `order:assigned` - Rider assigned
- `order:status-updated` - Status changed
- `order:otp-verified` - OTP verified (delivered)
- `order:failed` - Delivery failed
- `order:returned` - Returned to merchant

### Rider Events
- `rider:location-updated` - GPS location update
- `rider:status-changed` - Online/offline status
- `rider:order-assigned` - New order assigned

### Hub Events
- `hub:order-received` - Order arrived at hub
- `hub:order-dispatched` - Order dispatched

## 📊 Order Status Flow

```
pending → picked_up → at_hub → out_for_delivery → delivered
                                      ↓
                                   failed → returned
```

## 🔧 Maintenance

```bash
# View logs
tail -f logs/access-$(date +%Y-%m-%d).log

# Check MongoDB connection
mongosh mongodb://localhost:27017/wolan

# Backup database
mongodump --db=wolan --out=./backup

# Restore database
mongorestore --db=wolan ./backup/wolan
```

## 📄 License

MIT License - Wolan Logistics
