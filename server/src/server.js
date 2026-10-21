'use strict';

process.env.TZ = process.env.TZ || 'Asia/Tashkent';

const config = require('./config');
const logger = require('./config/logger');
const app = require('./app');
const { sequelize } = require('./models');
const jobs = require('./jobs');

async function start() {
  try {
    await sequelize.authenticate();
    logger.info("Ma'lumotlar bazasi bilan aloqa o'rnatildi");
  } catch (err) {
    logger.error('Bazaga ulanish xatosi:', err.message);
    process.exit(1);
  }

  const server = app.listen(config.port, config.host, () => {
    logger.info(`Server ${config.host}:${config.port} da ishga tushdi (${config.env})`);
    logger.info(`Timezone: ${config.timezone}`);
  });

  if (config.jobs.enabled) {
    jobs.startAll();
  } else {
    logger.warn("Job scheduler o'chirilgan (JOBS_ENABLED=false)");
  }

  const shutdown = async (signal) => {
    logger.info(`${signal} signal keldi, server to'xtatilmoqda...`);
    jobs.stopAll();
    server.close(() => {
      sequelize.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
  });
}

start();
