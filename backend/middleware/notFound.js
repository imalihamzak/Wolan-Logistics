const { errorResponse } = require('../utils/response');
const path = require('path');

const notFound = (req, res) => {
  // For API routes, return JSON error
  if (req.path.startsWith('/api')) {
    return errorResponse(res, `Route not found: ${req.originalUrl}`, 404);
  }

  // For non-API routes (SPA routes), serve the index.html
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading application');
    }
  });
};

module.exports = notFound;