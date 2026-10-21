'use strict';

const { z } = require('zod');

/**
 * Umumiy validatsiya sxemalari.
 */
const id = z.coerce.number().int().positive();

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD ko'rinishida bo'lishi kerak");

const employeeSchema = z.object({
  fullName: z.string().min(3).max(200),
  employeeNo: z.string().min(1).max(50),
  departmentId: id.nullish(),
  positionId: id.nullish(),
  hireDate: dateStr.nullish(),
  terminationDate: dateStr.nullish(),
  phone: z.string().max(30).nullish(),
  terminalUserId: z.string().max(50).nullish(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullish(),
});

const terminalSchema = z.object({
  name: z.string().min(2).max(150),
  ipAddress: z.string().regex(/^\d{1,3}(\.\d{1,3}){3}$/, "IP manzil to'g'ri emas"),
  port: z.coerce.number().int().min(1).max(65535).default(80),
  username: z.string().min(1).max(100).default('admin'),
  password: z.string().min(1).max(100),
  direction: z.enum(['in', 'out', 'both']).default('both'),
  serialNumber: z.string().max(100).nullish(),
  location: z.string().max(200).nullish(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).nullish(),
});

const shiftSchema = z.object({
  name: z.string().min(1).max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm ko'rinishida"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:mm ko'rinishida"),
  crossesMidnight: z.boolean().default(false),
  graceLateMinutes: z.coerce.number().int().min(0).max(240).default(10),
  graceEarlyMinutes: z.coerce.number().int().min(0).max(240).default(10),
  breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
  minWorkMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  isActive: z.boolean().optional(),
});

const scheduleSchema = z.object({
  employeeId: id,
  shiftId: id,
  validFrom: dateStr,
  validTo: dateStr.nullish(),
  weekdays: z.array(z.coerce.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]),
  priority: z.coerce.number().int().default(0),
  isActive: z.boolean().optional(),
});

const holidaySchema = z.object({
  date: dateStr,
  name: z.string().min(1).max(200),
  isWorking: z.boolean().default(false),
});

const leaveTypeSchema = z.object({
  name: z.string().min(1).max(150),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().optional(),
});

const leaveSchema = z.object({
  employeeId: id,
  leaveTypeId: id,
  startDate: dateStr,
  endDate: dateStr,
  comment: z.string().max(2000).nullish(),
});

const adjustmentSchema = z.object({
  employeeId: id,
  date: dateStr,
  firstIn: z.string().nullish(),
  lastOut: z.string().nullish(),
  workedMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  lateMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  earlyLeaveMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  status: z
    .enum(['present', 'late', 'absent', 'leave', 'holiday', 'day_off', 'incomplete'])
    .nullish(),
  note: z.string().max(255).nullish(),
  reason: z.string().min(3, "Sabab kamida 3 ta belgidan iborat bo'lishi kerak").max(1000),
});

const departmentSchema = z.object({
  name: z.string().min(1).max(150),
  parentId: id.nullish(),
  headEmployeeId: id.nullish(),
  isActive: z.boolean().optional(),
});

const positionSchema = z.object({
  name: z.string().min(1).max(150),
});

module.exports = {
  id,
  pagination,
  dateStr,
  employeeSchema,
  terminalSchema,
  shiftSchema,
  scheduleSchema,
  holidaySchema,
  leaveTypeSchema,
  leaveSchema,
  adjustmentSchema,
  departmentSchema,
  positionSchema,
};
