'use strict';

const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { DailyAttendance, Employee, Department, Timesheet } = require('../models');
const T = require('../utils/time');

const STATUS_LABELS = {
  present: 'Ishda',
  late: 'Kechikdi',
  absent: 'Kelmagan',
  leave: "Ta'til",
  holiday: 'Bayram',
  day_off: 'Dam kuni',
  incomplete: 'Tuzatish kerak',
};

class ReportService {
  /**
   * Kunlik hisobot qatorlari.
   */
  static async dailyRows({ dateFrom, dateTo, departmentId, employeeId, status }) {
    const where = { date: { [Op.gte]: dateFrom, [Op.lte]: dateTo } };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    if (departmentId) {
      const employees = await Employee.findAll({
        where: { departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: employees.map((e) => e.id) };
    }

    const rows = await DailyAttendance.findAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
      ],
      order: [
        ['date', 'ASC'],
        ['employeeId', 'ASC'],
      ],
    });

    return rows;
  }

  /**
   * Umumiy statistika (dashboard uchun).
   */
  static async summary({ dateFrom, dateTo, departmentId }) {
    const rows = await ReportService.dailyRows({ dateFrom, dateTo, departmentId });

    const stats = {
      dateFrom,
      dateTo,
      total: rows.length,
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      holiday: 0,
      dayOff: 0,
      incomplete: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      byDepartment: [],
    };

    const deptMap = new Map();

    for (const r of rows) {
      const key = r.status;
      if (key === 'present') stats.present += 1;
      else if (key === 'late') stats.late += 1;
      else if (key === 'absent') stats.absent += 1;
      else if (key === 'leave') stats.leave += 1;
      else if (key === 'holiday') stats.holiday += 1;
      else if (key === 'day_off') stats.dayOff += 1;
      else if (key === 'incomplete') stats.incomplete += 1;

      stats.workedMinutes += r.workedMinutes || 0;
      stats.lateMinutes += r.lateMinutes || 0;
      stats.earlyLeaveMinutes += r.earlyLeaveMinutes || 0;

      const deptName =
        r.Employee && r.Employee.Department ? r.Employee.Department.name : "Bo'limsiz";
      if (!deptMap.has(deptName)) {
        deptMap.set(deptName, {
          department: deptName,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          leave: 0,
          incomplete: 0,
          workedMinutes: 0,
        });
      }
      const d = deptMap.get(deptName);
      d.total += 1;
      if (r.status === 'present' || r.status === 'late') d.present += 1;
      if (r.status === 'late') d.late += 1;
      if (r.status === 'absent') d.absent += 1;
      if (r.status === 'leave') d.leave += 1;
      if (r.status === 'incomplete') d.incomplete += 1;
      d.workedMinutes += r.workedMinutes || 0;
    }

    stats.byDepartment = Array.from(deptMap.values());
    stats.averageWorkedMinutes = stats.total ? Math.round(stats.workedMinutes / stats.total) : 0;
    return stats;
  }

  /**
   * Excel eksport (kunlik tabel).
   */
  static async exportDailyXlsx(stream, { dateFrom, dateTo, departmentId }) {
    const rows = await ReportService.dailyRows({ dateFrom, dateTo, departmentId });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Klinika Davomat Nazorati';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Tabel ${dateFrom} - ${dateTo}`, {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    sheet.mergeCells('A1:J1');
    sheet.getCell('A1').value = `DAVOMAT TABELI  ${dateFrom} — ${dateTo}`;
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:J2');
    sheet.getCell('A2').value =
      `Chop etilgan: ${new Date().toLocaleString('ru-RU')}  |  Klinika davomat nazorati tizimi`;
    sheet.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    sheet.addRow([]);
    const header = sheet.addRow([
      '№',
      'Sana',
      'Xodim',
      'Tabel №',
      "Bo'lim",
      'Lavozim',
      'Kelish',
      'Ketish',
      'Ish vaqti (soat)',
      'Kechikish (daq)',
      'Holat',
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5F8C' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    let index = 0;
    for (const r of rows) {
      index += 1;
      const row = sheet.addRow([
        index,
        r.date,
        r.Employee ? r.Employee.fullName : '',
        r.Employee ? r.Employee.employeeNo : '',
        r.Employee && r.Employee.Department ? r.Employee.Department.name : '',
        r.Employee && r.Employee.Position ? r.Employee.Position.name : '',
        r.firstIn
          ? new Date(r.firstIn).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : '',
        r.lastOut
          ? new Date(r.lastOut).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          : '',
        T.minutesToHours(r.workedMinutes || 0),
        r.lateMinutes || 0,
        STATUS_LABELS[r.status] || r.status,
      ]);

      if (r.status === 'absent') {
        row.getCell(11).font = { color: { argb: 'FFB00020' }, bold: true };
      } else if (r.status === 'late') {
        row.getCell(11).font = { color: { argb: 'FFB26B00' }, bold: true };
      } else if (r.status === 'incomplete') {
        row.getCell(11).font = { color: { argb: 'FF9C27B0' }, bold: true };
      }
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'hair' },
          left: { style: 'hair' },
          bottom: { style: 'hair' },
          right: { style: 'hair' },
        };
      });
    }

    sheet.columns = [
      { width: 5 },
      { width: 12 },
      { width: 26 },
      { width: 10 },
      { width: 18 },
      { width: 18 },
      { width: 9 },
      { width: 9 },
      { width: 14 },
      { width: 14 },
      { width: 18 },
    ];
    sheet.getColumn(2).numFmt = 'yyyy-mm-dd';
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: 11 },
    };

    await workbook.xlsx.write(stream);
    stream.end();
  }

  /**
   * PDF eksport (oylik tabel).
   */
  static async exportTimesheetPdf(stream, { year, month, departmentId }) {
    const where = { year, month };
    const employees = await Employee.findAll({ where: { isActive: true }, attributes: ['id'] });
    const ids = employees.map((e) => e.id);
    if (departmentId) {
      const deptEmployees = await Employee.findAll({
        where: { departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: deptEmployees.map((e) => e.id) };
    } else {
      where.employeeId = { [Op.in]: ids };
    }

    const sheets = await Timesheet.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
      ],
      order: [['employeeId', 'ASC']],
    });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    doc.pipe(stream);

    doc
      .fontSize(16)
      .text(`OYLIK TABEL  —  ${year}-${String(month).padStart(2, '0')}`, { align: 'center' });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .text(`Chop etilgan: ${new Date().toLocaleString('ru-RU')}`, { align: 'center' });
    doc.moveDown(1);

    const headers = [
      '№',
      'Xodim',
      'Tabel №',
      "Bo'lim",
      'Ish kunlari',
      'Ish soati',
      'Kechikish',
      'Kelmagan',
      "Ta'til",
    ];
    const widths = [30, 150, 55, 110, 60, 65, 60, 60, 50];

    const drawHeader = (y) => {
      let x = doc.page.margins.left;
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.rect(x, y, widths[i], 18).stroke('#999999');
        doc.fillColor('#000000').text(h, x + 2, y + 5, { width: widths[i] - 4, ellipsis: true });
        x += widths[i];
      });
      doc.moveTo(0, 18);
      return y + 18;
    };

    let y = drawHeader(doc.y);

    sheets.rows.forEach((row, i) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = drawHeader(doc.y);
      }
      let x = doc.page.margins.left;
      doc.fontSize(8).font('Helvetica');
      const values = [
        i + 1,
        row.Employee ? row.Employee.fullName : '',
        row.Employee ? row.Employee.employeeNo : '',
        row.Employee && row.Employee.Department ? row.Employee.Department.name : '',
        row.workedDays,
        T.minutesToHours(row.workedMinutes),
        `${row.lateCount} / ${row.lateMinutes} daq`,
        row.absentDays,
        row.leaveDays,
      ];
      values.forEach((v, idx) => {
        doc.rect(x, y, widths[idx], 16).stroke('#CCCCCC');
        doc
          .fillColor('#000000')
          .text(String(v ?? ''), x + 2, y + 4, { width: widths[idx] - 4, ellipsis: true });
        x += widths[idx];
      });
      y += 16;
    });

    doc.end();
  }

  /**
   * Excel: oylik tabel
   */
  static async exportTimesheetXlsx(stream, { year, month, departmentId }) {
    const where = { year, month };
    if (departmentId) {
      const deptEmployees = await Employee.findAll({
        where: { departmentId },
        attributes: ['id'],
      });
      where.employeeId = { [Op.in]: deptEmployees.map((e) => e.id) };
    }

    const sheets = await Timesheet.findAll({
      where,
      include: [
        {
          model: Employee,
          required: false,
          include: [{ model: Department, as: 'Department', required: false }],
        },
      ],
      order: [['employeeId', 'ASC']],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Tabel ${year}-${String(month).padStart(2, '0')}`);

    sheet.mergeCells('A1:I1');
    sheet.getCell('A1').value = `OYLIK TABEL  ${year}-${String(month).padStart(2, '0')}`;
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const header = sheet.addRow([
      '№',
      'Xodim',
      'Tabel №',
      "Bo'lim",
      'Ish kunlari',
      'Ish soati',
      'Kechikish (soni)',
      'Kechikish (daqiqa)',
      'Kelmagan',
      "Ta'til",
    ]);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E5F8C' } };
      cell.alignment = { horizontal: 'center', wrapText: true };
    });

    sheets.forEach((row, i) => {
      sheet.addRow([
        i + 1,
        row.Employee ? row.Employee.fullName : '',
        row.Employee ? row.Employee.employeeNo : '',
        row.Employee && row.Employee.Department ? row.Employee.Department.name : '',
        row.workedDays,
        T.minutesToHours(row.workedMinutes),
        row.lateCount,
        row.lateMinutes,
        row.absentDays,
        row.leaveDays,
      ]);
    });

    sheet.columns = [
      { width: 5 },
      { width: 28 },
      { width: 12 },
      { width: 20 },
      { width: 12 },
      { width: 12 },
      { width: 16 },
      { width: 18 },
      { width: 12 },
      { width: 10 },
    ];
    sheet.getRow(3).font = { bold: true };

    await workbook.xlsx.write(stream);
    stream.end();
  }
}

module.exports = ReportService;
module.exports.STATUS_LABELS = STATUS_LABELS;
