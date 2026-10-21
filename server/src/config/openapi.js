'use strict';

/**
 * OpenAPI (Swagger) spetsifikatsiyasi.
 * Panelga kirish:  /api/docs
 */
const { PERMISSIONS } = require('./rbac');

const errorResponse = {
  400: { description: "Noto'g'ri so'rov", schema: { $ref: '#/components/schemas/Error' } },
  401: { description: 'Autentifikatsiya talab qilinadi' },
  403: { description: "Ruxsat yo'q" },
  404: { description: 'Topilmadi' },
  409: { description: 'Konflikti (allaqachon mavjud)' },
  500: { description: 'Server ichki xatosi' },
};

const schemas = {
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'validation_error' },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
          requestId: { type: 'string' },
        },
      },
    },
  },
  Auth: {
    type: 'object',
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      user: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          fullName: { type: 'string' },
          role: { type: 'string', example: 'superadmin' },
          permissions: { type: 'array', items: { type: 'string' } },
          mustChangePassword: { type: 'boolean' },
        },
      },
    },
  },
  Employee: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      fullName: { type: 'string' },
      employeeNo: { type: 'string' },
      departmentId: { type: 'integer', nullable: true },
      positionId: { type: 'integer', nullable: true },
      hireDate: { type: 'string', format: 'date', nullable: true },
      terminationDate: { type: 'string', format: 'date', nullable: true },
      isActive: { type: 'boolean' },
      phone: { type: 'string', nullable: true },
      terminalUserId: { type: 'string', nullable: true },
      faceEnrolled: { type: 'boolean' },
    },
  },
  Terminal: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      ipAddress: { type: 'string', example: '192.168.50.11' },
      port: { type: 'integer', example: 80 },
      username: { type: 'string' },
      password: { type: 'string', description: 'Faqat yozishda' },
      direction: { type: 'string', enum: ['in', 'out', 'both'] },
      status: { type: 'string', enum: ['active', 'offline'] },
      serialNumber: { type: 'string', nullable: true },
      lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  DailyAttendance: {
    type: 'object',
    properties: {
      id: { type: 'integer' },
      employeeId: { type: 'integer' },
      date: { type: 'string', format: 'date' },
      firstIn: { type: 'string', format: 'date-time', nullable: true },
      lastOut: { type: 'string', format: 'date-time', nullable: true },
      workedMinutes: { type: 'integer' },
      lateMinutes: { type: 'integer' },
      earlyLeaveMinutes: { type: 'integer' },
      status: {
        type: 'string',
        enum: ['present', 'late', 'absent', 'leave', 'holiday', 'day_off', 'incomplete'],
      },
      isManualAdjusted: { type: 'boolean' },
    },
  },
};

const paths = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Server, baza va terminallar holati',
      security: [],
      responses: { 200: { description: 'Holat' }, 503: { description: "Baza bilan aloqa yo'q" } },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Tizimga kirish',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['username', 'password'],
              properties: {
                username: { type: 'string', example: 'admin' },
                password: { type: 'string', format: 'password' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Tokenlar', schema: { $ref: '#/components/schemas/Auth' } },
        ...errorResponse,
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Access token yangilash (rotatsiya bilan)',
      responses: { 200: { description: 'Yangi tokenlar' }, ...errorResponse },
    },
  },
  '/auth/logout': {
    post: { tags: ['Auth'], summary: 'Chiqish', responses: { 200: { description: 'OK' } } },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Joriy foydalanuvchi',
      responses: { 200: { description: 'OK' } },
    },
  },
  '/auth/password': {
    post: {
      tags: ['Auth'],
      summary: "Parolni o'zgartirish",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword', 'confirmPassword'],
              properties: {
                currentPassword: { type: 'string' },
                newPassword: { type: 'string', minLength: 8 },
                confirmPassword: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { 200: { description: "O'zgartirildi" }, ...errorResponse },
    },
  },
  '/employees': {
    get: {
      tags: ['Employees'],
      summary: "Xodimlar ro'yxati",
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer' } },
        { name: 'limit', in: 'query', schema: { type: 'integer' } },
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Qidiruv' },
        { name: 'departmentId', in: 'query', schema: { type: 'integer' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: { 200: { description: 'OK' }, ...errorResponse },
    },
    post: {
      tags: ['Employees'],
      summary: "Xodim qo'shish (avtomatik terminalga yuboriladi)",
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Employee' } } },
      },
      responses: { 201: { description: 'Yaratildi' }, ...errorResponse },
    },
  },
  '/employees/import-excel': {
    post: {
      tags: ['Employees'],
      summary: "Xodimlarni Excel'dan import qilish",
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      },
      responses: { 200: { description: 'Import natijasi' }, ...errorResponse },
    },
  },
  '/employees/template.xlsx': {
    get: {
      tags: ['Employees'],
      summary: 'Xodimlar import shabloni',
      responses: { 200: { description: 'XLSX' } },
    },
  },
  '/terminals': {
    get: { tags: ['Terminals'], summary: 'Terminallar', responses: { 200: { description: 'OK' } } },
    post: {
      tags: ['Terminals'],
      summary: "Terminal qo'shish",
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Terminal' } } },
      },
      responses: { 201: { description: 'Yaratildi' }, ...errorResponse },
    },
  },
  '/terminals/{id}/test': {
    post: {
      tags: ['Terminals'],
      summary: 'Terminal bilan aloqa tekshiruvi',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: { 200: { description: 'OK' } },
    },
  },
  '/attendance/logs': {
    get: {
      tags: ['Attendance'],
      summary: 'Xom davomat loglari',
      parameters: [
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'employeeId', in: 'query', schema: { type: 'integer' } },
        { name: 'terminalId', in: 'query', schema: { type: 'integer' } },
        { name: 'page', in: 'query', schema: { type: 'integer' } },
      ],
      responses: { 200: { description: 'OK' } },
    },
  },
  '/attendance/daily': {
    get: {
      tags: ['Attendance'],
      summary: 'Kunlik hisoblangan davomat',
      responses: {
        200: {
          description: 'OK',
          schema: { type: 'array', items: { $ref: '#/components/schemas/DailyAttendance' } },
        },
      },
    },
  },
  '/attendance/adjust': {
    post: {
      tags: ['Attendance'],
      summary: "Qo'lda tuzatish (sabab + audit bilan)",
      responses: { 200: { description: 'OK' }, ...errorResponse },
    },
  },
  '/attendance/import-excel': {
    post: {
      tags: ['Attendance'],
      summary: "Tabelni Excel'dan import qilish",
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
          },
        },
      },
      responses: { 200: { description: 'Import natijasi' }, ...errorResponse },
    },
  },
  '/attendance/tabel/{year}/{month}/template.xlsx': {
    get: {
      tags: ['Attendance'],
      summary: 'Oylik tabel shabloni (matritsa)',
      parameters: [
        { name: 'year', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'month', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: { 200: { description: 'XLSX' } },
    },
  },
  '/timesheets/{year}/{month}': {
    get: {
      tags: ['Reports'],
      summary: 'Oylik tabel',
      parameters: [
        { name: 'year', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'month', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: { 200: { description: 'OK' } },
    },
  },
  '/reports/summary': {
    get: {
      tags: ['Reports'],
      summary: 'Umumiy statistika',
      responses: { 200: { description: 'OK' } },
    },
  },
  '/roles': {
    get: {
      tags: ['System'],
      summary: 'Rollar va huquqlar',
      responses: { 200: { description: 'OK' } },
    },
  },
  '/roles/{id}/permissions': {
    put: {
      tags: ['System'],
      summary: "Rol huquqlarini o'zgartirish",
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: { 200: { description: 'OK' }, ...errorResponse },
    },
  },
  '/notifications': {
    get: {
      tags: ['System'],
      summary: 'Bildirishnomalar',
      responses: { 200: { description: 'OK' } },
    },
  },
  '/settings': {
    get: {
      tags: ['System'],
      summary: 'Tizim sozlamalari',
      responses: { 200: { description: 'OK' } },
    },
    put: {
      tags: ['System'],
      summary: 'Sozlamalarni yangilash (Telegram va boshqalar)',
      responses: { 200: { description: 'OK' }, ...errorResponse },
    },
  },
  '/hikvision/events': {
    post: {
      tags: ['Terminals'],
      summary: 'Terminal eventlarini qabul qilish (push)',
      security: [],
      description: 'IP allowlist + token bilan himoyalangan',
      responses: { 200: { description: 'Qabul qilindi' }, 403: { description: "Ruxsat yo'q" } },
    },
  },
};

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Klinika Davomat Nazorati API',
    version: '1.1.0',
    description:
      'Hikvision Face ID terminallari uchun lokal davomat nazorati tizimi.\n\n' +
      `**Rollar:** ${Object.keys(PERMISSIONS).join(', ')}`,
    contact: { name: 'Klinika IT' },
    license: { name: 'Internal' },
  },
  servers: [{ url: '/api', description: 'Lokal server' }],
  tags: [
    { name: 'System', description: 'Tizim, sozlamalar, rollar, bildirishnomalar' },
    { name: 'Auth', description: 'Autentifikatsiya va profil' },
    { name: 'Employees', description: 'Xodimlar' },
    { name: 'Terminals', description: 'Terminallar va ISAPI integratsiyasi' },
    { name: 'Attendance', description: 'Davomat loglari va tabel' },
    { name: 'Reports', description: 'Hisobotlar va eksport' },
    { name: 'Permissions', description: 'Rol huquqlari' },
  ],
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths,
};

module.exports = spec;
