require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const app = require('./app');
const connectDB = require('./config/db');
const User = require('./models/User');
const { initSockets } = require('./sockets');

const PORT = process.env.PORT || 5000;
const MAX_PORT_RETRIES = 5;

/**
 * Environment Validation
 * Validates required environment variables at startup
 */
const validateEnvironment = () => {
  const requiredVars = [
    'NODE_ENV',
    'MONGODB_URI',
    'JWT_SECRET',
  ];

  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    const productionVars = ['SOCKET_CORS_ORIGIN', 'CLIENT_ORIGIN', 'RATE_LIMIT_WINDOW_MS'];
    const missingProd = productionVars.filter(varName => !process.env[varName]);

    if (missingProd.length > 0) {
      console.warn(`Warning: Missing production variables: ${missingProd.join(', ')}`);
    }
  }

  console.log(`Environment validation passed (${process.env.NODE_ENV || 'development'})`);
};

/**
 * Production Logging
 * Structured logging for production environments
 */
const createLogger = () => {
  const logDir = process.env.LOG_DIR || './logs';

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const accessLog = fs.createWriteStream(path.join(logDir, `access-${date}.log`), { flags: 'a' });
  const errorLog = fs.createWriteStream(path.join(logDir, `error-${date}.log`), { flags: 'a' });

  return {
    access: (message) => {
      const timestamp = new Date().toISOString();
      accessLog.write(`[${timestamp}] ${message}\n`);
    },
    error: (message) => {
      const timestamp = new Date().toISOString();
      errorLog.write(`[${timestamp}] ${message}\n`);
      console.error(`[${timestamp}] ${message}`);
    },
    close: () => {
      accessLog.end();
      errorLog.end();
    }
  };
};

const logger = process.env.NODE_ENV === 'production' ? createLogger() : null;

/**
 * Graceful Shutdown Handler
 * Handles process termination gracefully
 */
const setupGracefulShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`\n${signal} received, starting graceful shutdown...`);

    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
      });
    }

    if (logger) {
      logger.close();
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    if (logger) {
      logger.error(`Uncaught Exception: ${error.message}\n${error.stack}`);
    }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (logger) {
      logger.error(`Unhandled Rejection: ${reason}`);
    }
  });
};

/**
 * Port listening with retry logic
 */
const listenOnPort = (server, port, attempt = 0) => {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES) {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use, retrying on ${nextPort}`);
      listenOnPort(server, nextPort, attempt + 1);
      return;
    }

    console.error(`Server failed to start: ${error.message}`);
    if (logger) {
      logger.error(`Server startup error: ${error.message}`);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    const publicApiUrl = (
      process.env.PUBLIC_API_URL
      || process.env.API_PUBLIC_URL
      || (process.env.NODE_ENV === 'production'
        ? 'https://api.wolan.bakefort.com'
        : `http://localhost:${port}`)
    ).replace(/\/+$/, '');
    const healthUrl = `${publicApiUrl}/api/v1/health`;

    console.log('='.repeat(50));
    console.log('Wolan Logistics Backend Started');
    console.log('='.repeat(50));
    console.log(`Server URL: ${publicApiUrl}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health: GET ${healthUrl}`);
    console.log('='.repeat(50));

    if (logger) {
      logger.access(`Server started on port ${port}`);
    }
  });
};

/**
 * Performance optimization: Keep-alive headers
 */
const optimizeServer = (server) => {
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
};

/**
 * Main server startup
 */
const seedDefaultAdmin = async () => {
  const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@wolan.com';
  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'password123';
  const defaultFullName = process.env.DEFAULT_ADMIN_FULL_NAME || 'Admin';

  const userCount = await User.countDocuments();
  if (userCount === 0) {
    console.log('No users found. Creating default super_admin account.');
    await User.create({
      full_name: defaultFullName,
      email: defaultEmail,
      password: defaultPassword,
      role: 'super_admin',
      is_active: true,
      kyc_status: 'verified',
      account_locked: false,
      failed_login_attempts: 0,
      last_login: new Date(),
    });
    console.log(`Default admin created: ${defaultEmail}`);
  }
};

const startServer = async () => {
  try {
    validateEnvironment();
    await connectDB();
    await seedDefaultAdmin();

    const server = http.createServer(app);
    initSockets(server);

    optimizeServer(server);
    setupGracefulShutdown(server);

    listenOnPort(server, Number(PORT));
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    if (logger) {
      logger.error(`Startup error: ${error.message}\n${error.stack}`);
    }
    process.exit(1);
  }
};

startServer();
