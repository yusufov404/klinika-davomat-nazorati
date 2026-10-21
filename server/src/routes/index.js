'use strict';

const express = require('express');
const { authenticate } = require('../middlewares/auth');
const { notFound } = require('../middlewares/errorHandler');

const router = express.Router();

// --- API hujjatlari (Swagger UI) ---
try {
  const swaggerUi = require('swagger-ui-express');
  const spec = require('../config/openapi');
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'Klinika Davomat API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'list', filter: true },
    })
  );
  router.get('/openapi.json', (req, res) => res.json(spec));
} catch (e) {
  // swagger-ui-express o'rnatilmagan bo'lsa — hujjatlar chiqmaydi
}

// --- Ommaviy (autentifikatsiyasiz) ---
router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/hikvision', require('./hikvision.routes'));

// --- Himoyalangan ---
router.use('/employees', authenticate, require('./employees.routes'));
router.use('/terminals', authenticate, require('./terminals.routes'));
router.use('/attendance', authenticate, require('./attendance.routes'));
router.use('/timesheets', authenticate, require('./attendance.routes').timesheetRouter);
router.use('/leaves', authenticate, require('./leaves.routes'));
router.use('/reports', authenticate, require('./reports.routes'));
router.use('/notifications', authenticate, require('./notifications.routes'));
router.use('/settings', authenticate, require('./notifications.routes').settings);
router.use('/errors', authenticate, require('./notifications.routes').errors);

// Professional imkoniyatlar (HR oqimi, self-service, xavfsizlik, hisobotlar)
router.use('/', require('./professional.routes'));
// --- Boshqaruv modullari ---
const admin = require('./admin.routes');
router.use('/departments', authenticate, admin.departments);
router.use('/positions', authenticate, admin.positions);
router.use('/shifts', authenticate, admin.shifts);
router.use('/schedules/bulk', authenticate, admin.schedulesBulk);
router.use('/schedules', authenticate, admin.schedules);
router.use('/holidays', authenticate, admin.holidays);
router.use('/leave-types', authenticate, admin.leaveTypes);
router.use('/users', authenticate, admin.users);
router.use('/roles', authenticate, admin.roles);
router.use('/audit', authenticate, admin.auditLogs);

router.use(notFound);

module.exports = router;
