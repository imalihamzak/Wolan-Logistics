# Wolan Logistics Auth Module

## Endpoints

### Register
POST /api/v1/auth/register

Request:
```json
{
  "full_name": "Amit Sharma",
  "email": "amit@example.com",
  "phone": "9876543210",
  "password": "StrongPass123!",
  "role": "merchant",
  "hub_id": "66c0f1d7a8c1f10c2bd12345",
  "profile_image": "https://cdn.example.com/profile.jpg"
}
```

Response:
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "user": {
      "id": "66c0f1d7a8c1f10c2bd12345",
      "full_name": "Amit Sharma",
      "email": "amit@example.com",
      "phone": "9876543210",
      "role": "merchant",
      "hub_id": "66c0f1d7a8c1f10c2bd12346",
      "profile_image": "https://cdn.example.com/profile.jpg",
      "is_active": true,
      "last_login": "2026-05-01T05:00:00.000Z"
    }
  }
}
```

### Login
POST /api/v1/auth/login

Request:
```json
{
  "email": "amit@example.com",
  "password": "StrongPass123!"
}
```

### Refresh Token
POST /api/v1/auth/refresh-token

Use the `refreshToken` cookie or send it in the body.

### Logout
POST /api/v1/auth/logout

### Forgot Password
POST /api/v1/auth/forgot-password

Request:
```json
{
  "email": "amit@example.com"
}
```

### Reset Password
POST /api/v1/auth/reset-password/:resetToken

Request:
```json
{
  "password": "NewStrongPass123!",
  "confirm_password": "NewStrongPass123!"
}
```

### Change Password
PATCH /api/v1/auth/change-password

Headers:
```http
Authorization: Bearer <accessToken>
```

Request:
```json
{
  "current_password": "StrongPass123!",
  "password": "NewStrongPass123!",
  "confirm_password": "NewStrongPass123!"
}
```

### Current Profile
GET /api/v1/auth/me

Headers:
```http
Authorization: Bearer <accessToken>
```

## Postman Tips

1. Save `accessToken` and `refreshToken` from login/register into environment variables.
2. Use `accessToken` in the `Authorization` header for protected requests.
3. Keep cookies enabled for refresh-token-based flows.
4. For password reset testing, copy the `resetToken` from the forgot-password response in development.