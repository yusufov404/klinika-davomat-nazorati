'use strict';

const os = require('os');

/**
 * Prometheus metrikalari (scrape uchun).
 * Format: /metrics
 */
class MetricsService {
  static counters = {};
  static gauges = {};
  static histograms = {};

  static increment(name, labels = {}, value = 1) {
    const key = MetricsService.key(name, labels);
    MetricsService.counters[key] = (MetricsService.counters[key] || 0) + value;
  }

  static set(name, value, labels = {}) {
    MetricsService.gauges[MetricsService.key(name, labels)] = value;
  }

  static observe(name, seconds, labels = {}) {
    const key = MetricsService.key(name, labels);
    if (!MetricsService.histograms[key])
      MetricsService.histograms[key] = { count: 0, sum: 0, max: 0 };
    const h = MetricsService.histograms[key];
    h.count += 1;
    h.sum += seconds;
    h.max = Math.max(h.max, seconds);
  }

  static key(name, labels) {
    const parts = Object.entries(labels)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${String(v).replace(/"/g, '')}"`);
    return parts.length ? `${name}{${parts.join(',')}}` : name;
  }

  static escape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  /**
   * Prometheus eksport matni.
   */
  static async render() {
    const lines = [];
    const push = (type, name, help) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
    };

    // --- Jarayon metrikalari ---
    const mem = process.memoryUsage();
    push('gauge', 'process_resident_memory_bytes', 'Resident memory');
    MetricsService.set('process_resident_memory_bytes', mem.rss);
    MetricsService.set('process_heap_used_bytes', mem.heapUsed);
    MetricsService.set('process_uptime_seconds', Math.round(process.uptime()));
    MetricsService.set(
      'process_cpu_user_seconds_total',
      Math.round(os.userInfo().utime * 1000) / 1000
    );

    // --- DB ---
    try {
      const {
        sequelize,
        AttendanceLog,
        DailyAttendance,
        Terminal,
        Employee,
      } = require('../models');
      const [db] = await sequelize.query('SELECT 1 as ok');
      MetricsService.set('db_up', db && db.ok ? 1 : 0);
      MetricsService.set('db_attendance_logs_total', await AttendanceLog.count());
      MetricsService.set('db_daily_attendance_total', await DailyAttendance.count());
      MetricsService.set('db_terminals_total', await Terminal.count());
      MetricsService.set('db_employees_total', await Employee.count());
    } catch (e) {
      MetricsService.set('db_up', 0);
    }

    // --- Ko'rsatkichlar ---
    lines.push('# HELP attendance_events_total Total received events by source');
    lines.push('# TYPE attendance_events_total counter');
    for (const [key, value] of Object.entries(MetricsService.counters)) {
      lines.push(`${key} ${value}`);
    }

    lines.push('# HELP attendance_gauges Current gauge values');
    lines.push('# TYPE attendance_gauges gauge');
    for (const [key, value] of Object.entries(MetricsService.gauges)) {
      lines.push(`${key} ${value}`);
    }

    lines.push('# HELP request_duration_seconds Request duration histogram');
    lines.push('# TYPE request_duration_seconds summary');
    for (const [key, h] of Object.entries(MetricsService.histograms)) {
      lines.push(`${key}_count ${h.count}`);
      lines.push(`${key}_sum ${h.sum.toFixed(3)}`);
    }

    return `${lines.join('\n')}\n`;
  }
}

module.exports = MetricsService;
