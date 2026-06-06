const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

const PRODUCTION_CLIENT_ORIGINS = [
  'https://wolan.bakefort.com',
  'https://admin.wolan.bakefort.com',
  'https://merchant.wolan.bakefort.com',
  'https://driver.wolan.bakefort.com',
  'https://wolan.catrinafreshmex.host',
  'https://admin.wolan.catrinafreshmex.host',
  'https://merchant.wolan.catrinafreshmex.host',
  'https://driver.wolan.catrinafreshmex.host',
];
const PRODUCTION_API_ORIGINS = [
  'https://api.wolan.bakefort.com',
  'https://api.wolan.catrinafreshmex.host',
];

const normalizeTrustProxy = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
};

const trustProxy = process.env.TRUST_PROXY || (process.env.NODE_ENV === 'production' ? '1' : 'false');
app.set('trust proxy', normalizeTrustProxy(trustProxy));

const parseOrigins = (value = '') => value
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const configuredOrigins = [
  ...parseOrigins(process.env.CLIENT_ORIGIN),
  ...parseOrigins(process.env.CORS_ORIGIN),
];

const allowedOrigins = new Set([
  ...PRODUCTION_CLIENT_ORIGINS,
  ...PRODUCTION_API_ORIGINS,
  ...configuredOrigins,
  // Local development origins:
  // 'http://localhost:4173',
  // 'http://127.0.0.1:4173',
  // 'http://localhost:5173',
  // 'http://127.0.0.1:5173',
]);

const corsOptions = {
  origin: (origin, callback) => {
    const normalizedOrigin = origin ? origin.replace(/\/+$/, '') : origin;

    if (!normalizedOrigin || allowedOrigins.has(normalizedOrigin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Wolan-Device-Id',
    'X-Wolan-Device-Label',
    'X-Wolan-Device-Platform',
    'X-Wolan-Device-Compromised',
    'X-Wolan-Device-Rooted',
    'X-Wolan-Device-Jailbroken',
  ],
  optionsSuccessStatus: 204,
};

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(limiter);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/', (req, res) => res.status(200).json({
  success: true,
  message: 'Welcome to Wolan Logistics API',
  data: {
    service: 'wolan-logistics-backend',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    api_base: '/api/v1',
    welcome_url: '/api/v1/welcome',
    health_url: '/api/v1/health',
    timestamp: new Date().toISOString(),
  },
}));

app.get('/welcome', (req, res) => res.status(200).json({
  success: true,
  message: 'Welcome to Wolan Logistics API',
  data: {
    service: 'wolan-logistics-backend',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    api_base: '/api/v1',
    welcome_url: '/api/v1/welcome',
    health_url: '/api/v1/health',
    timestamp: new Date().toISOString(),
  },
}));

app.use('/api/v1', routes);

app.use(express.static('./public'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
