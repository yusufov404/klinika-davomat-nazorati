'use strict';

const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const {
  Employee,
  Department,
  DailyAttendance,
  ManualAdjustment,
  Shift,
  Holiday,
} = require('../models');
const T = require('../utils/time');
const audit = require('./audit.service');

/**
 * =====================================================================
 *  EXCEL INTEGRATSIYASI — tabel uchun
 *
 *  1) Shablon eksporti (matritsa): xodimlar qatori, kunlar ustuni.
 *     Foydalanuvchi Excel'da to'ldiradi va qayta import qiladi.
 *  2) Import: fayldagi o'zgarishlarni `daily_attendance` ga qo'llaydi
 *     (qo'lda tuzatish sifatida, audit bilan).
 *
 *  Qo'llanish kodi:
 *    I — Ishda (present)      K — Kechikdi (late)
 *    T — Ta'til (leave)       B — Bayram (holiday)
 *    D — Dam kuni (day_off)   X — Kelmagan (absent)
 * =====================================================================
 */

const STATUS_CODES = {
  I: { status: 'present', label: 'Ishda', color: 'FFE9F7EF' },
  K: { status: 'late', label: 'Kechikdi', color: 'FFFDF3DC' },
  T: { status: 'leave', label: "Ta'til", color: 'FFE7F0FB' },
  B: { status: 'holiday', label: 'Bayram', color: 'FFF1E9FC' },
  D: { status: 'day_off', label: 'Dam kuni', color: 'FFEFF1F5' },
  X: { status: 'absent', label: 'Kelmagan', color: 'FFFBE9E9' },
};

const STATUS_BY_NAME = {
  ishda: 'I',
  ishta: 'I',
  isdа: 'I',
  present: 'I',
  '+': 'I',
  ish: 'I',
  kechikdi: 'K',
  kechikgan: 'K',
  late: 'K',
  "ta'til": 'T',
  tatil: 'T',
  leave: 'T',
  bayram: 'B',
  holiday: 'B',
  'dam kuni': 'D',
  dam: 'D',
  day_off: 'D',
  damkuni: 'D',
  kelmagan: 'X',
  absent: 'X',
  "yo'q": 'X',
};

const CODE_LIST = Object.keys(STATUS_CODES).join(',');

/** Katakdagi qiymatni kodga aylantirish */
function normalizeCellValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    // soatlar soni -> "Ishda" (ish vaqti alohida import qilinadi)
    return { code: 'I', hours: value };
  }
  const text = String(value).trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (STATUS_CODES[upper]) return { code: upper, hours: null };
  const byName = STATUS_BY_NAME[text.toLowerCase().replace(/\s+/g, ' ')];
  if (byName) return { code: byName, hours: null };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { code: 'I', hours: parseFloat(text) };
  return { code: null, hours: null, invalid: text };
}

class ExcelService {
  // =================================================================
  //  MATRITSA SHABLONI
  // =================================================================

  /**
   * Oylik tabel matritsasini Excel'ga yozish.
   * @param {import('stream').Writable} stream
   * @param {{year:number, month:number, departmentId?:number}} opts
   */
  static async exportTabelMatrix(stream, { year, month, departmentId }) {
    const dates = T.monthDates(year, month);
    const first = dates[0];
    const last = dates[dates.length - 1];

    const where = { isActive: true };
    if (departmentId) where.departmentId = departmentId;

    const employees = await Employee.findAll({
      where,
      include: [{ model: Department, as: 'Department', required: false }],
      order: [['fullName', 'ASC']],
    });

    const rows = await DailyAttendance.findAll({
      where: {
        employeeId: { [Op.in]: employees.map((e) => e.id) },
        date: { [Op.gte]: first, [Op.lte]: last },
      },
    });

    const byEmployee = new Map();
    for (const r of rows) {
      if (!byEmployee.has(r.employeeId)) byEmployee.set(r.employeeId, new Map());
      byEmployee.get(r.employeeId).set(r.date, r);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Klinika Davomat Nazorati';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Tabel', {
      views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }],
    });

    const totalCols = 4 + dates.length + 4; // №, Xodim, Tabel№, Bo'lim + kunlar + 4 xulosa
    const lastCol = ExcelService.colLetter(totalCols);

    // --- Sarlavha ---
    sheet.mergeCells(`A1:${lastCol}1`);
    sheet.getCell('A1').value = `OYLIK TABEL  —  ${year}-${String(month).padStart(2, '0')}`;
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 24;

    sheet.mergeCells(`A2:${lastCol}2`);
    sheet.getCell('A2').value =
      "Kun kataklarini to'ldiring: I=ishda, K=kechikdi, T=ta'til, B=bayram, D=dam kuni, X=kelmagan. " +
      "Bo'sh qoldirilgan katak o'zgartirilmaydi. 'Qo'llanma' varaqini ko'ring.";
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // --- Sarlavha qatori ---
    const headerValues = ['№', 'Xodim', 'Tabel №', "Bo'lim"];
    dates.forEach((d, _i) => {
      const day = new Date(`${d}T12:00:00+05:00`).getDate();
      headerValues.push(String(day));
    });
    headerValues.push('Ish soati', 'Kechikish (daq)', 'Kelgan kun', 'Izoh');

    const header = sheet.addRow(headerValues);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5F8C' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    header.height = 26;

    // --- Xodimlar qatorlari ---
    let index = 0;
    for (const emp of employees) {
      index += 1;
      const empRows = byEmployee.get(emp.id) || new Map();

      const values = [
        index,
        emp.fullName,
        emp.employeeNo,
        emp.Department ? emp.Department.name : '',
      ];

      let totalMinutes = 0;
      let totalLate = 0;
      let presentDays = 0;

      for (const d of dates) {
        const rec = empRows.get(d);
        if (!rec) {
          values.push('');
          continue;
        }
        const code = ExcelService.statusToCode(rec.status);
        values.push(code || '');
        totalMinutes += rec.workedMinutes || 0;
        totalLate += rec.lateMinutes || 0;
        if (rec.status === 'present' || rec.status === 'late') presentDays += 1;
      }

      values.push(Math.round((totalMinutes / 60) * 100) / 100, totalLate, presentDays, '');

      const row = sheet.addRow(values);
      row.height = 18;

      for (let c = 0; c < values.length; c += 1) {
        const cell = row.getCell(c + 1);
        cell.border = {
          top: { style: 'hair' },
          left: { style: 'hair' },
          bottom: { style: 'hair' },
          right: { style: 'hair' },
        };
        cell.alignment = { horizontal: c < 4 || c >= 4 + dates.length ? 'left' : 'center' };
        cell.font = { size: 10 };
        if (c >= 4 && c < 4 + dates.length) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${CODE_LIST}"`],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: "Noto'g'ri qiymat",
            error: `Faqat ${CODE_LIST} yoki bo'sh qoldiring`,
          };
          const code = values[c];
          if (code && STATUS_CODES[code]) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: STATUS_CODES[code].color },
            };
            cell.font = { size: 10, bold: true };
          }
        }
      }
    }

    // --- Ustun kengliklari ---
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 26;
    sheet.getColumn(3).width = 11;
    sheet.getColumn(4).width = 18;
    for (let i = 0; i < dates.length; i += 1) sheet.getColumn(5 + i).width = 4.2;
    sheet.getColumn(5 + dates.length).width = 11;
    sheet.getColumn(6 + dates.length).width = 14;
    sheet.getColumn(7 + dates.length).width = 11;
    sheet.getColumn(8 + dates.length).width = 28;

    // --- Qo'llanma varaqi ---
    await ExcelService.addGuideSheet(workbook, { year, month, dates, employees: employees.length });

    await workbook.xlsx.write(stream);
    stream.end();
  }

  /**
   * "Qo'llanma" varaqi (kodlar, izohlar, ishga tushirish qoidalari).
   */
  static async addGuideSheet(workbook, { year, month, dates, employees }) {
    const sheet = workbook.addWorksheet("Qo'llanma");
    sheet.getColumn(1).width = 16;
    sheet.getColumn(2).width = 22;
    sheet.getColumn(3).width = 70;

    const title = sheet.addRow([`Qo'llanma — ${year}-${String(month).padStart(2, '0')}`]);
    title.getCell(1).font = { size: 14, bold: true };
    sheet.addRow([]);

    sheet.addRow(['Kod', 'Holat', "Tizimdagi ma'nosi"]).font = { bold: true };
    const meanings = {
      I: 'Ishda — kunlik davomat hisobida "present"',
      K: 'Kechikdi — "late" (kechikish daqiqalari o\'zgarmaydi)',
      T: 'Ta\'til — "leave" (tasdiqlangan ta\'til ham shu yerda)',
      B: 'Bayram — "holiday"',
      D: 'Dam kuni — "day_off"',
      X: 'Kelmagan — "absent"',
    };
    for (const [code, meta] of Object.entries(STATUS_CODES)) {
      const r = sheet.addRow([code, meta.label, meanings[code]]);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.color } };
      r.getCell(1).font = { bold: true };
      r.getCell(1).alignment = { horizontal: 'center' };
    }

    sheet.addRow([]);
    const rules = [
      ['QOIDALAR', '', ''],
      [
        '1',
        "Faqat o'zgarishi kerak kataklarni tahrirlang",
        "Bo'sh qoldirilgan kataklar import qilinmaydi",
      ],
      ['2', 'Ish vaqti (soat) va Kechikish ustunlari', 'Importda hisobga olinadi (ixtiyoriy)'],
      ['3', 'Izoh ustuni', 'Har bir qator uchun tuzatish sababi (audit logga yoziladi)'],
      [
        '4',
        'TABEL № ustuni',
        'Xodimni aniqlash uchun (bo\'sh qoldirilsa "Xodim" ustunidan topiladi)',
      ],
      [
        '5',
        'Import qilish',
        '"Tabel" varaqini o\'zgartirmasdan yuklang (boshqa fayl nomi ham mumkin)',
      ],
      [
        '6',
        "Qo'lda tuzatilgan kunlar",
        'Import qilingan kunlar avtomatik qayta hisoblanishdan himoyalanadi',
      ],
    ];
    for (const [a, b, c] of rules) {
      const r = sheet.addRow([a, b, c]);
      if (a === 'QOIDALAR') r.font = { bold: true, size: 12 };
    }

    sheet.addRow([]);
    const shifts = await Shift.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
    sheet.addRow(['SMENALAR', '', '']).font = { bold: true, size: 12 };
    for (const s of shifts) {
      sheet.addRow([
        '',
        s.name,
        `${s.startTime} - ${s.endTime}${s.crossesMidnight ? ' (tungi)' : ''}, grace ${s.graceLateMinutes}/${s.graceEarlyMinutes} daq, tanaffus ${s.breakMinutes} daq`,
      ]);
    }

    const holidays = await Holiday.findAll({
      where: { date: { [Op.between]: [dates[0], dates[dates.length - 1]] } },
      order: [['date', 'ASC']],
    });
    if (holidays.length) {
      sheet.addRow([]);
      sheet.addRow(['BAYRAMLAR', '', '']).font = { bold: true, size: 12 };
      for (const h of holidays) {
        sheet.addRow(['', h.date, `${h.name}${h.isWorking ? ' (ish kuni)' : ''}`]);
      }
    }

    sheet.addRow([]);
    sheet.addRow(['XODIMLAR SONI', String(employees), '']);
    sheet.addRow(['TABEL OYI', `${year}-${String(month).padStart(2, '0')}`, '']);
  }

  /**
   * status -> Excel kodi
   */
  static statusToCode(status) {
    const found = Object.entries(STATUS_CODES).find(([, v]) => v.status === status);
    return found ? found[0] : null;
  }

  // =================================================================
  //  IMPORT
  // =================================================================

  /**
   * Yuklangan faylni tahlil qilish.
   * @param {Buffer} buffer
   * @returns {Promise<{format:string, rows:Array, errors:Array, meta:object}>}
   */
  static async parseWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet =
      workbook.getWorksheet('Tabel') || workbook.getWorksheet('tabel') || workbook.worksheets[0];

    if (!sheet) {
      return {
        format: null,
        rows: [],
        errors: [{ message: 'Faylda varaq (sheet) topilmadi' }],
        meta: {},
      };
    }

    const matrix = ExcelService.detectMatrix(sheet);
    if (matrix) {
      return {
        format: 'matrix',
        rows: ExcelService.parseMatrixRows(sheet, matrix),
        errors: [],
        meta: { year: matrix.year, month: matrix.month, days: matrix.dayColumns.length },
      };
    }

    const daily = ExcelService.detectDaily(sheet);
    if (daily) {
      return {
        format: 'daily',
        rows: ExcelService.parseDailyRows(sheet, daily),
        errors: [],
        meta: {},
      };
    }

    return {
      format: null,
      rows: [],
      errors: [
        {
          message:
            "Fayl formati tanib olinmadi. 'Tabel' (matritsa) yoki kunlik tabel (Sana/Xodim) shablonidan foydalaning.",
        },
      ],
      meta: {},
    };
  }

  /**
   * Matritsa sarlavhasini aniqlash.
   */
  static detectMatrix(sheet) {
    const maxRow = Math.min(sheet.rowCount, 12);
    for (let r = 1; r <= maxRow; r += 1) {
      const row = sheet.getRow(r);
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        values[col - 1] = cell.value;
      });

      const nameIdx = values.findIndex(
        (v) => typeof v === 'string' && v.trim().toLowerCase() === 'xodim'
      );
      if (nameIdx === -1) continue;

      const noIdx = values.findIndex(
        (v) => typeof v === 'string' && v.trim().toLowerCase().includes('tabel')
      );
      const dayColumns = [];
      values.forEach((v, i) => {
        const n = typeof v === 'number' ? v : parseInt(String(v || '').trim(), 10);
        if (Number.isInteger(n) && n >= 1 && n <= 31) dayColumns.push({ col: i + 1, day: n });
      });
      if (!dayColumns.length) continue;

      // Yil/oy sarlavhadan
      let year = null;
      let month = null;
      const titleCell = sheet.getCell('A1');
      const title =
        typeof titleCell.value === 'object' && titleCell.value ? titleCell.value.richText : null;
      const titleText = title
        ? title.map((t) => t.text).join('')
        : typeof titleCell.value === 'string'
          ? titleCell.value
          : '';
      const m = titleText.match(/(\d{4})\s*[-/]\s*(\d{1,2})/);
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
      }

      return {
        headerRow: r,
        nameCol: nameIdx + 1,
        noCol: noIdx >= 0 ? noIdx + 1 : null,
        dayColumns,
        year,
        month,
      };
    }
    return null;
  }

  /**
   * Matritsa qatorlarini o'qish.
   */
  static parseMatrixRows(sheet, matrix) {
    const rows = [];
    const commentCol = this.findColumnByHeader(sheet, matrix.headerRow, 'izoh');
    const hoursCol = this.findColumnByHeader(sheet, matrix.headerRow, 'ish soati');
    const lateCol = this.findColumnByHeader(sheet, matrix.headerRow, 'kechikish');

    for (let r = matrix.headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const name = ExcelService.cellText(row.getCell(matrix.nameCol));
      const employeeNo = matrix.noCol ? ExcelService.cellText(row.getCell(matrix.noCol)) : '';
      if (!name && !employeeNo) continue;

      const cells = {};
      let hasValue = false;
      for (const { col, day } of matrix.dayColumns) {
        const parsed = normalizeCellValue(row.getCell(col).value);
        if (parsed) {
          cells[day] = parsed;
          hasValue = true;
        }
      }

      const hours = hoursCol ? Number(row.getCell(hoursCol).value) : NaN;
      const late = lateCol ? Number(row.getCell(lateCol).value) : NaN;
      const comment = commentCol ? ExcelService.cellText(row.getCell(commentCol)) : '';

      if (!hasValue) continue;

      rows.push({
        rowNumber: r,
        employeeNo,
        employeeName: name,
        cells,
        totalHours: Number.isFinite(hours) ? hours : null,
        lateMinutes: Number.isFinite(late) ? late : null,
        comment,
      });
    }
    return rows;
  }

  /**
   * Kunlik format sarlavhasini aniqlash.
   */
  static detectDaily(sheet) {
    const maxRow = Math.min(sheet.rowCount, 12);
    for (let r = 1; r <= maxRow; r += 1) {
      const row = sheet.getRow(r);
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        values[col - 1] = String(cell.value ?? '')
          .trim()
          .toLowerCase();
      });
      const dateIdx = values.findIndex((v) => v === 'sana' || v === 'date');
      const nameIdx = values.findIndex((v) => v === 'xodim' || v === 'ishmasa');
      if (dateIdx === -1 || nameIdx === -1) continue;

      const find = (...names) => values.findIndex((v) => names.some((n) => v.includes(n)));

      return {
        headerRow: r,
        dateCol: dateIdx + 1,
        nameCol: nameIdx + 1,
        noCol: (() => {
          const i = find('tabel');
          return i >= 0 ? i + 1 : null;
        })(),
        inCol: (() => {
          const i = find('kelish');
          return i >= 0 ? i + 1 : null;
        })(),
        outCol: (() => {
          const i = find('ketish');
          return i >= 0 ? i + 1 : null;
        })(),
        hoursCol: (() => {
          const i = find('ish vaqti');
          return i >= 0 ? i + 1 : null;
        })(),
        lateCol: (() => {
          const i = find('kechikish');
          return i >= 0 ? i + 1 : null;
        })(),
        earlyCol: (() => {
          const i = find('erta ketish');
          return i >= 0 ? i + 1 : null;
        })(),
        statusCol: (() => {
          const i = find('holat');
          return i >= 0 ? i + 1 : null;
        })(),
      };
    }
    return null;
  }

  /**
   * Kunlik format qatorlarini o'qish.
   */
  static parseDailyRows(sheet, meta) {
    const rows = [];
    for (let r = meta.headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const date = ExcelService.parseExcelDate(row.getCell(meta.dateCol).value);
      const name = ExcelService.cellText(row.getCell(meta.nameCol));
      const employeeNo = meta.noCol ? ExcelService.cellText(row.getCell(meta.noCol)) : '';
      if (!date || (!name && !employeeNo)) continue;

      const statusRaw = meta.statusCol ? row.getCell(meta.statusCol).value : null;
      const statusParsed = normalizeCellValue(statusRaw);
      const status = statusParsed ? statusParsed.code : null;

      const inRaw = meta.inCol ? row.getCell(meta.inCol).value : null;
      const outRaw = meta.outCol ? row.getCell(meta.outCol).value : null;
      const hours = meta.hoursCol ? Number(row.getCell(meta.hoursCol).value) : NaN;
      const late = meta.lateCol ? Number(row.getCell(meta.lateCol).value) : NaN;
      const early = meta.earlyCol ? Number(row.getCell(meta.earlyCol).value) : NaN;

      rows.push({
        rowNumber: r,
        date,
        employeeNo,
        employeeName: name,
        status,
        firstIn: ExcelService.parseExcelTime(inRaw),
        lastOut: ExcelService.parseExcelTime(outRaw),
        workedMinutes: Number.isFinite(hours) ? Math.round(hours * 60) : null,
        lateMinutes: Number.isFinite(late) ? late : null,
        earlyLeaveMinutes: Number.isFinite(early) ? early : null,
        comment: '',
      });
    }
    return rows;
  }

  static findColumnByHeader(sheet, headerRow, needle) {
    const row = sheet.getRow(headerRow);
    let found = null;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (found) return;
      const v = String(cell.value ?? '').toLowerCase();
      if (v.includes(needle)) found = col;
    });
    return found;
  }

  static cellText(cell) {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if (v.text) return String(v.text);
      if (v.result !== undefined) return String(v.result);
    }
    return String(v).trim();
  }

  static parseExcelDate(value) {
    if (!value) return null;
    if (value instanceof Date) return T.dateKey(value);
    const text = String(value).trim();
    let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    const d = new Date(text);
    return isNaN(d) ? null : T.dateKey(d);
  }

  static parseExcelTime(value) {
    if (!value) return null;
    if (value instanceof Date) {
      const h = String(value.getHours()).padStart(2, '0');
      const min = String(value.getMinutes()).padStart(2, '0');
      return `${h}:${min}`;
    }
    const text = String(value).trim();
    const m = text.match(/^(\d{1,2})[:.](\d{2})/);
    if (m) return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
    return null;
  }

  // =================================================================
  //  IMPORTNI QO'LLASH
  // =================================================================

  /**
   * Tahlil qilingan qatorlarni bazaga qo'llaydi.
   *
   * @param {Array} rows
   * @param {object} opts { year, month, reason, userId, ipAddress }
   */
  static async applyImport(rows, { year, month, reason, userId, ipAddress }) {
    const report = {
      total: rows.length,
      applied: 0,
      unchanged: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    const employees = await Employee.findAll({
      where: { isActive: true },
      attributes: ['id', 'fullName', 'employeeNo', 'terminalUserId'],
    });

    const findEmployee = (row) => {
      const no = (row.employeeNo || '').trim();
      if (no) {
        const byNo = employees.find((e) => e.employeeNo === no || e.terminalUserId === no);
        if (byNo) return byNo;
      }
      const name = (row.employeeName || '').trim().toLowerCase();
      if (name) {
        return employees.find((e) => e.fullName.trim().toLowerCase() === name);
      }
      return null;
    };

    for (const row of rows) {
      const employee = findEmployee(row);
      if (!employee) {
        report.skipped += 1;
        report.errors.push({
          row: row.rowNumber,
          message: `Xodim topilmadi: ${row.employeeName || row.employeeNo || 'nomi berilmagan'}`,
        });
        continue;
      }

      // --- Matritsa ---
      if (row.cells) {
        const monthDates = T.monthDates(year, month);
        for (const [day, cell] of Object.entries(row.cells)) {
          if (cell.invalid) {
            report.errors.push({
              row: row.rowNumber,
              message: `${day}-kun: noto'g'ri qiymat "${cell.invalid}"`,
            });
            continue;
          }
          const date = monthDates[Number(day) - 1];
          if (!date) continue;

          const status = STATUS_CODES[cell.code].status;
          const result = await ExcelService.applyDay({
            employee,
            date,
            status,
            mode: 'status',
            workedMinutes: cell.hours ? Math.round(cell.hours * 60) : null,
            reason: row.comment || reason,
            userId,
            ipAddress,
          });
          ExcelService.addToReport(report, result);
        }
        continue;
      }

      // --- Kunlik format ---
      if (!row.status) {
        report.skipped += 1;
        continue;
      }
      const status = STATUS_CODES[row.status].status;
      const result = await ExcelService.applyDay({
        employee,
        date: row.date,
        status,
        mode: 'full',
        workedMinutes: row.workedMinutes,
        firstIn: row.firstIn,
        lastOut: row.lastOut,
        lateMinutes: row.lateMinutes,
        earlyLeaveMinutes: row.earlyLeaveMinutes,
        reason: row.comment || reason,
        userId,
        ipAddress,
      });
      ExcelService.addToReport(report, result);
    }

    await audit.record({
      userId,
      action: 'attendance.import_excel',
      entity: 'daily_attendance',
      after: {
        applied: report.applied,
        unchanged: report.unchanged,
        skipped: report.skipped,
        errors: report.errors.length,
      },
      ipAddress,
    });

    return report;
  }

  static addToReport(report, result) {
    if (result.state === 'applied') {
      report.applied += 1;
      report.details.push(result);
    } else if (result.state === 'unchanged') {
      report.unchanged += 1;
    } else {
      report.skipped += 1;
      report.errors.push({ row: result.row, message: result.message });
    }
  }

  /**
   * Bitta kunning qiymatini bazaga qo'llaydi.
   *
   * mode = 'status' — faqat holat kodini qo'llaydi (matritsa importi).
   *                 Kelish/ketish vaqtlari saqlanadi (agar mavjud bo'lsa).
   * mode = 'full'   — vaqtlar, soatlar va kechikish fayldan olinadi (kunlik import).
   */
  static async applyDay({
    employee,
    date,
    status,
    mode = 'status',
    workedMinutes = null,
    firstIn = null,
    lastOut = null,
    lateMinutes = null,
    earlyLeaveMinutes = null,
    reason,
    userId,
    ipAddress,
  }) {
    const existing = await DailyAttendance.findOne({
      where: { employeeId: employee.id, date },
    });

    const shift = await ExcelService.getShiftForDate(employee.id, date);
    const isWorking = status === 'present' || status === 'late';

    // ------------------------------------------------------------------
    //  1) O'zgarish bormi? (faqat o'zgan qiymatlar qo'llanadi)
    // ------------------------------------------------------------------
    if (existing && mode === 'status' && workedMinutes === null) {
      if (existing.status === status) {
        return { state: 'unchanged', employee: employee.fullName, date };
      }
    }

    // ------------------------------------------------------------------
    //  2) Vaqtlar va ish vaqti
    // ------------------------------------------------------------------
    let inTime = firstIn;
    let outTime = lastOut;
    let minutes = workedMinutes;

    if (!isWorking) {
      // Ishlamagan kun: vaqtlar tozalanadi
      inTime = null;
      outTime = null;
      minutes = 0;
    } else {
      if (mode === 'status') {
        // Matritsa: mavjud vaqtlar saqlanadi, yo'q bo'lsa smenadan olinadi
        inTime = existing && existing.firstIn ? ExcelService.toTimeString(existing.firstIn) : null;
        outTime = existing && existing.lastOut ? ExcelService.toTimeString(existing.lastOut) : null;
        if (minutes === null) {
          minutes = existing && existing.workedMinutes ? existing.workedMinutes : null;
        }
      }
      if (!inTime || !outTime) {
        if (shift) {
          const start = shift.startTime;
          const end = ExcelService.shiftEndTime(shift);
          if (!inTime) inTime = start;
          if (!outTime) outTime = end;
        }
      }
      if (minutes === null) {
        if (inTime && outTime) {
          let diff = T.timeToMinutes(outTime) - T.timeToMinutes(inTime);
          if (diff < 0) diff += 1440;
          minutes = Math.max(0, diff - (shift ? shift.breakMinutes || 0 : 0));
        } else {
          minutes = 0;
        }
      }
    }

    const newValue = {
      employeeId: employee.id,
      date,
      shiftId: existing ? existing.shiftId : shift ? shift.id : null,
      firstIn: inTime ? ExcelService.timeToDate(date, inTime) : null,
      lastOut: outTime ? ExcelService.timeToDate(date, outTime) : null,
      workedMinutes: minutes || 0,
      lateMinutes:
        lateMinutes !== null && lateMinutes !== undefined
          ? lateMinutes
          : existing
            ? existing.lateMinutes
            : 0,
      earlyLeaveMinutes:
        earlyLeaveMinutes !== null && earlyLeaveMinutes !== undefined
          ? earlyLeaveMinutes
          : existing
            ? existing.earlyLeaveMinutes
            : 0,
      breakMinutes: existing ? existing.breakMinutes : shift ? shift.breakMinutes || 0 : 0,
      status,
      isManualAdjusted: true,
      note: existing ? existing.note : null,
      computedAt: new Date(),
    };

    // ------------------------------------------------------------------
    //  3) To'liq solishtirish (kunlik format uchun)
    // ------------------------------------------------------------------
    if (existing && mode === 'full') {
      const same =
        existing.status === newValue.status &&
        (existing.workedMinutes || 0) === (newValue.workedMinutes || 0) &&
        (existing.lateMinutes || 0) === (newValue.lateMinutes || 0) &&
        (existing.earlyLeaveMinutes || 0) === (newValue.earlyLeaveMinutes || 0) &&
        ExcelService.sameTime(existing.firstIn, newValue.firstIn) &&
        ExcelService.sameTime(existing.lastOut, newValue.lastOut);

      if (same) {
        return { state: 'unchanged', employee: employee.fullName, date };
      }
    }

    const before = existing ? existing.toJSON() : null;

    const [row] = await DailyAttendance.upsert(newValue, {
      where: { employeeId: employee.id, date },
    });

    await ManualAdjustment.create({
      employeeId: employee.id,
      date,
      oldValue: before,
      newValue: row.toJSON(),
      reason: reason || 'Excel orqali import',
      createdBy: userId,
    });

    await audit.record({
      userId,
      action: 'attendance.import_excel_day',
      entity: 'daily_attendance',
      entityId: row.id,
      before,
      after: row.toJSON(),
      ipAddress,
    });

    return {
      state: 'applied',
      employee: employee.fullName,
      date,
      from: before ? before.status : null,
      to: status,
    };
  }

  /**
   * Xodimning shu kundagi smenasi.
   */
  static async getShiftForDate(employeeId, date) {
    const attendanceService = require('./attendance.service');
    const pairs = await attendanceService.getEmployeeShifts(employeeId, date);
    return pairs.length ? pairs[0].shift : null;
  }

  static sameTime(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return new Date(a).getTime() === new Date(b).getTime();
  }

  /** Date -> "HH:mm" */
  static toTimeString(value) {
    const d = new Date(value);
    if (isNaN(d)) return null;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: T.TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('hour')}:${get('minute')}`;
  }

  /** Smena tugash vaqti (tungi smenada keyingi kunga o'tadi) */
  static shiftEndTime(shift) {
    const end = T.minutesToTime(T.timeToMinutes(shift.endTime));
    return shift.crossesMidnight ? end : end;
  }

  static timeToDate(dateKey, hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const base = T.startOfDay(dateKey).getTime();
    return new Date(base + (h || 0) * 3600000 + (m || 0) * 60000);
  }

  // =================================================================
  //  XODIMLARNING EXCEL IMPORT/EXPORT
  // =================================================================

  /**
   * Xodimlar uchun shablon (bo'lim, lavozim, telefon, ishga olish sanasi).
   */
  static async exportEmployeesTemplate(stream) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Klinika Davomat Nazorati';

    const sheet = workbook.addWorksheet('Xodimlar');
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = "XODIMLAR RO'YXATI — import shabloni";
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.getRow(1).height = 24;

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value =
      "Majburiy ustunlar: Xodim, Tabel №. Bo'lim va Lavozim nomi bo'yicha avtomatik yaratiladi. " +
      'Tabel № takrorlanmasa — xodim yangilanadi.';
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };

    const header = sheet.addRow([
      'Xodim (F.I.O)',
      'Tabel №',
      "Bo'lim",
      'Lavozim',
      'Telefon',
      'Ishga olish sanasi',
      'Terminal ID',
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5F8C' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    header.height = 26;

    // Namuna qator
    const sample = sheet.addRow([
      'Alisher Karimov',
      '1001',
      "Terapiya bo'limi",
      'Shifokor',
      '+998901234567',
      '2026-01-15',
      '1001',
    ]);
    sample.font = { color: { argb: 'FF999999' }, italic: true };

    sheet.columns = [
      { width: 28 },
      { width: 12 },
      { width: 22 },
      { width: 20 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
    ];
    sheet.views = [{ state: 'frozen', ySplit: 3 }];

    const guide = workbook.addWorksheet("Qo'llanma");
    guide.getColumn(1).width = 22;
    guide.getColumn(2).width = 80;
    guide.addRow(['Ustun', 'Tushuntirish']).font = { bold: true };
    const rows = [
      ['Xodim (F.I.O)', "Xodimning to'liq ismi. Majburiy."],
      ['Tabel №', 'Tabel raqami — noyob dagi yagona raqam. Majburiy (takrorlanmasa).'],
      ["Bo'lim", "Bo'lim nomi. Yo'q bo'lsa — avtomatik yaratiladi."],
      ['Lavozim', "Lavozim nomi. Yo'q bo'lsa — avtomatik yaratiladi."],
      ['Telefon', 'Ixtiyoriy.'],
      ['Ishga olish sanasi', "Ixtiyoriy. YYYY-MM-DD ko'rinishida."],
      ['Terminal ID', "Terminaldagi employeeNo. Bo'sh qoldirilsa — Tabel № ishlatiladi."],
    ];
    for (const [a, b] of rows) guide.addRow([a, b]);

    await workbook.xlsx.write(stream);
    stream.end();
  }

  /**
   * Xodimlarni Excel'dan import qilish.
   * @param {Buffer} buffer
   * @param {object} opts { userId, dryRun }
   */
  static async importEmployees(buffer, { userId = null, dryRun = false } = {}) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheet =
      workbook.getWorksheet('Xodimlar') ||
      workbook.getWorksheet('Xodimlar ') ||
      workbook.worksheets[0];
    if (!sheet) {
      return {
        format: null,
        errors: [{ message: 'Faylda varaq topilmadi' }],
        created: 0,
        updated: 0,
      };
    }

    // Sarlavhani aniqlash
    let headerRow = 0;
    let cols = null;
    for (let r = 1; r <= Math.min(sheet.rowCount, 10); r += 1) {
      const values = [];
      sheet.getRow(r).eachCell({ includeEmpty: true }, (cell, c) => {
        values[c - 1] = String(cell.value ?? '')
          .trim()
          .toLowerCase();
      });
      const nameIdx = values.findIndex((v) => v.includes('xodim') && !v.includes('terminal'));
      const noIdx = values.findIndex((v) => v.includes('tabel'));
      if (nameIdx >= 0 && noIdx >= 0) {
        headerRow = r;
        cols = {
          name: nameIdx + 1,
          employeeNo: noIdx + 1,
          department: values.findIndex((v) => v.includes("bo'lim")) + 1 || null,
          position: values.findIndex((v) => v.includes('lavozim')) + 1 || null,
          phone: values.findIndex((v) => v.includes('telefon')) + 1 || null,
          hireDate: values.findIndex((v) => v.includes('ishga')) + 1 || null,
          terminalId: values.findIndex((v) => v.includes('terminal')) + 1 || null,
        };
        break;
      }
    }

    if (!headerRow) {
      return {
        format: null,
        errors: [{ message: "Sarlavha topilmadi. 'Xodim' va 'Tabel №' ustunlari bo'lishi kerak." }],
        created: 0,
        updated: 0,
      };
    }

    const { Department, Position, Employee } = require('../models');

    const report = { created: 0, updated: 0, skipped: 0, errors: [], details: [] };
    const deptCache = new Map();
    const posCache = new Map();

    const findOrCreateByName = async (model, cache, name) => {
      if (!name) return null;
      if (cache.has(name)) return cache.get(name);
      let row = await model.findOne({ where: { name } });
      if (!row) {
        if (dryRun) {
          row = { id: -1, name, __virtual: true };
        } else {
          row = await model.create({ name });
        }
      }
      cache.set(name, row);
      return row;
    };

    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const fullName = ExcelService.cellText(row.getCell(cols.name));
      const employeeNo = ExcelService.cellText(row.getCell(cols.employeeNo));

      if (!fullName && !employeeNo) continue;
      if (!fullName) {
        report.skipped += 1;
        report.errors.push({ row: r, message: "Xodim ismi bo'sh" });
        continue;
      }
      if (!employeeNo) {
        report.skipped += 1;
        report.errors.push({ row: r, message: `${fullName}: Tabel № bo'sh` });
        continue;
      }

      const departmentName = cols.department
        ? ExcelService.cellText(row.getCell(cols.department))
        : '';
      const positionName = cols.position ? ExcelService.cellText(row.getCell(cols.position)) : '';
      const phone = cols.phone ? ExcelService.cellText(row.getCell(cols.phone)) : '';
      const hireDateRaw = cols.hireDate ? ExcelService.cellText(row.getCell(cols.hireDate)) : '';
      const terminalId = cols.terminalId ? ExcelService.cellText(row.getCell(cols.terminalId)) : '';

      const department = await findOrCreateByName(Department, deptCache, departmentName);
      const position = await findOrCreateByName(Position, posCache, positionName);

      const payload = {
        fullName,
        employeeNo,
        departmentId: department ? department.id : null,
        positionId: position ? position.id : null,
        phone: phone || null,
        hireDate: hireDateRaw ? ExcelService.parseExcelDate(hireDateRaw) : null,
        terminalUserId: terminalId || employeeNo,
        isActive: true,
      };

      const existing = await Employee.findOne({ where: { employeeNo } });

      if (existing) {
        if (!dryRun) await existing.update(payload);
        report.updated += 1;
        report.details.push({ row: r, name: fullName, action: 'yangilandi' });
      } else {
        if (!dryRun) await Employee.create(payload);
        report.created += 1;
        report.details.push({ row: r, name: fullName, action: 'yaratildi' });
      }
    }

    if (!dryRun) {
      await audit.record({
        userId,
        action: 'employee.import_excel',
        entity: 'employees',
        after: { created: report.created, updated: report.updated, errors: report.errors.length },
      });
    }

    return { format: 'employees', ...report };
  }

  /**
   * Excel ustun harfi (1 -> A).
   */
  static colLetter(n) {
    let s = '';
    let x = n;
    while (x > 0) {
      const rem = (x - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      x = Math.floor((x - 1) / 26);
    }
    return s;
  }
}

module.exports = ExcelService;
module.exports.STATUS_CODES = STATUS_CODES;
module.exports.normalizeCellValue = normalizeCellValue;
