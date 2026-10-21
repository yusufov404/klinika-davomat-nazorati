'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./config/logger');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimit');
const { requestContext } = require('./middlewares/requestContext');
require('./utils/response'); // res.ok / res.list / res.created yordamchilari

const app = express();

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// --- So'rov konteksti (request id + kirish logi) ---
app.use(requestContext);

// --- Xavfsizlik ---
app.use(
  helmet({
    contentSecurityPolicy: false, // statik admin panel CDN/tailwind uchun
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// --- Loglar (requestContext allaqachon loglaydi) ---
if (config.env !== 'test' && config.logLevel === 'debug') {
  app.use(
    morgan(':method :url :status :response-time ms - :res[content-length]', {
      skip: (req) => req.path === '/api/health',
      stream: { write: (msg) => logger.debug(msg.trim()) },
    })
  );
}

// --- API ---
app.use('/api', apiLimiter, routes);

// --- Statik admin panel (agar bitta konteynerda ishlatilsa) ---
const webDist = process.env.WEB_DIST_PATH || path.resolve(__dirname, '..', '..', 'web', 'public');
const staticMaxAge = config.env === 'production' ? '1h' : 0;
app.use(
  express.static(webDist, {
    index: 'index.html',
    maxAge: staticMaxAge,
    etag: true,
    setHeaders(res, filePath) {
      // HTML har doim yangilanadi (asset'lar esa versiya bilan keshlanadi)
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  })
);
app.get(/^(?!\/api).*/, (req, res, next) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// --- Xatolar ---
app.use(errorHandler);

module.exports = app;
