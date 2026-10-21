'use strict';

const sequelize = require('../config/database');

const Role = require('./role')(sequelize);
const RolePermission = require('./rolePermission')(sequelize);
const Setting = require('./setting')(sequelize);
const ErrorLog = require('./errorLog')(sequelize);
const Notification = require('./notification')(sequelize);
const TimesheetPeriod = require('./timesheetPeriod')(sequelize);
const LeaveBalance = require('./leaveBalance')(sequelize);
const OvertimeRecord = require('./overtimeRecord')(sequelize);
const AttendanceRequest = require('./attendanceRequest')(sequelize);
const Consent = require('./consent')(sequelize);
const ReportTemplate = require('./reportTemplate')(sequelize);
const ApiKey = require('./apiKey')(sequelize);
const User = require('./user')(sequelize);
const RefreshToken = require('./refreshToken')(sequelize);
const LoginAttempt = require('./loginAttempt')(sequelize);
const Department = require('./department')(sequelize);
const Position = require('./position')(sequelize);
const Employee = require('./employee')(sequelize);
const Terminal = require('./terminal')(sequelize);
const TerminalSyncJob = require('./terminalSyncJob')(sequelize);
const AttendanceLog = require('./attendanceLog')(sequelize);
const UnmatchedEvent = require('./unmatchedEvent')(sequelize);
const Shift = require('./shift')(sequelize);
const EmployeeSchedule = require('./employeeSchedule')(sequelize);
const Holiday = require('./holiday')(sequelize);
const LeaveType = require('./leaveType')(sequelize);
const Leave = require('./leave')(sequelize);
const DailyAttendance = require('./dailyAttendance')(sequelize);
const Timesheet = require('./timesheet')(sequelize);
const ManualAdjustment = require('./manualAdjustment')(sequelize);
const AuditLog = require('./auditLog')(sequelize);

// ---------- Rollar va foydalanuvchilar ----------
Role.hasMany(User, { foreignKey: 'roleId' });
User.belongsTo(Role, { foreignKey: 'roleId' });
Role.hasMany(RolePermission, { foreignKey: 'roleId', onDelete: 'CASCADE' });
RolePermission.belongsTo(Role, { foreignKey: 'roleId' });
User.hasMany(ErrorLog, { foreignKey: 'userId' });
ErrorLog.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Notification, { foreignKey: 'userId', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId' });

// HR oqimi
Employee.hasMany(AttendanceRequest, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
AttendanceRequest.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(OvertimeRecord, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
OvertimeRecord.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(LeaveBalance, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
LeaveBalance.belongsTo(Employee, { foreignKey: 'employeeId' });
LeaveType.hasMany(LeaveBalance, { foreignKey: 'leaveTypeId', onDelete: 'CASCADE' });
LeaveBalance.belongsTo(LeaveType, { foreignKey: 'leaveTypeId' });
Employee.hasMany(Consent, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Consent.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(ReportTemplate, { foreignKey: 'createdBy' });
ReportTemplate.belongsTo(User, { foreignKey: 'createdBy' });
User.hasMany(ApiKey, { foreignKey: 'createdBy' });
ApiKey.belongsTo(User, { foreignKey: 'createdBy' });
User.hasMany(RefreshToken, { foreignKey: 'userId', onDelete: 'CASCADE' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

// ---------- Tashkiliy tuzilma ----------
Department.hasMany(Department, { foreignKey: 'parentId', as: 'children' });
Department.belongsTo(Department, { foreignKey: 'parentId', as: 'parent' });
Department.hasMany(Employee, { foreignKey: 'departmentId' });
Employee.belongsTo(Department, { foreignKey: 'departmentId' });
Position.hasMany(Employee, { foreignKey: 'positionId' });
Employee.belongsTo(Position, { foreignKey: 'positionId' });
// Bo'lim boshlig'i (head_employee_id ustuni departments jadvalida)
Department.belongsTo(Employee, { as: 'head', foreignKey: 'headEmployeeId' });
Employee.hasMany(Department, { as: 'headedDepartments', foreignKey: 'headEmployeeId' });

// ---------- Terminallar ----------
Terminal.hasMany(AttendanceLog, { foreignKey: 'terminalId' });
AttendanceLog.belongsTo(Terminal, { foreignKey: 'terminalId' });
Terminal.hasMany(TerminalSyncJob, { foreignKey: 'terminalId', onDelete: 'CASCADE' });
TerminalSyncJob.belongsTo(Terminal, { foreignKey: 'terminalId' });
Employee.hasMany(TerminalSyncJob, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
TerminalSyncJob.belongsTo(Employee, { foreignKey: 'employeeId' });

// ---------- Davomat loglari ----------
Employee.hasMany(AttendanceLog, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
AttendanceLog.belongsTo(Employee, { foreignKey: 'employeeId' });
Terminal.hasMany(UnmatchedEvent, { foreignKey: 'terminalId', onDelete: 'CASCADE' });
UnmatchedEvent.belongsTo(Terminal, { foreignKey: 'terminalId' });
UnmatchedEvent.belongsTo(Employee, { foreignKey: 'employeeId' });
Employee.hasMany(UnmatchedEvent, { foreignKey: 'employeeId' });

// ---------- Grafik ----------
Shift.hasMany(EmployeeSchedule, { foreignKey: 'shiftId' });
EmployeeSchedule.belongsTo(Shift, { foreignKey: 'shiftId' });
Employee.hasMany(EmployeeSchedule, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
EmployeeSchedule.belongsTo(Employee, { foreignKey: 'employeeId' });

// ---------- Ta'tillar ----------
LeaveType.hasMany(Leave, { foreignKey: 'leaveTypeId' });
Leave.belongsTo(LeaveType, { foreignKey: 'leaveTypeId' });
Employee.hasMany(Leave, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Leave.belongsTo(Employee, { foreignKey: 'employeeId' });
Leave.belongsTo(User, { as: 'approver', foreignKey: 'approvedBy' });

// ---------- Tabel ----------
Employee.hasMany(DailyAttendance, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
DailyAttendance.belongsTo(Employee, { foreignKey: 'employeeId' });
DailyAttendance.belongsTo(Shift, { foreignKey: 'shiftId' });
Employee.hasMany(Timesheet, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
Timesheet.belongsTo(Employee, { foreignKey: 'employeeId' });

// ---------- Audit ----------
User.hasMany(ManualAdjustment, { foreignKey: 'createdBy' });
ManualAdjustment.belongsTo(User, { as: 'creator', foreignKey: 'createdBy' });
User.hasMany(AuditLog, { foreignKey: 'userId' });
AuditLog.belongsTo(User, { foreignKey: 'userId' });

module.exports = {
  sequelize,
  Sequelize: sequelize.Sequelize,
  Role,
  RolePermission,
  Setting,
  ErrorLog,
  Notification,
  TimesheetPeriod,
  LeaveBalance,
  OvertimeRecord,
  AttendanceRequest,
  Consent,
  ReportTemplate,
  ApiKey,
  User,
  RefreshToken,
  LoginAttempt,
  Department,
  Position,
  Employee,
  Terminal,
  TerminalSyncJob,
  AttendanceLog,
  UnmatchedEvent,
  Shift,
  EmployeeSchedule,
  Holiday,
  LeaveType,
  Leave,
  DailyAttendance,
  Timesheet,
  ManualAdjustment,
  AuditLog,
};
