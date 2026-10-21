'use strict';

const axios = require('axios');
const config = require('../../config');
const { parseChallenge, buildAuthorization } = require('./digest');

/**
 * Hikvision ISAPI klienti.
 * Barcha so'rovlar localhost/LAN ichida, Digest authentication bilan.
 */
class HikvisionClient {
  /**
   * @param {object} terminal Terminal model yoki { ipAddress, port, username, password }
   */
  constructor(terminal) {
    this.ip = terminal.ipAddress;
    this.port = terminal.port || 80;
    this.username = terminal.username || 'admin';
    this.password = terminal.password;
    this.baseURL = `http://${this.ip}:${this.port}`;
    this.timeout = config.hikvision.timeout;
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: { 'Content-Type': 'application/json' },
      maxBodyLength: 20 * 1024 * 1024,
      maxContentLength: 20 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 500,
    });
  }

  /**
   * Digest challenge olish va so'rovni yuborish.
   * @param {object} opts
   * @param {string} opts.method
   * @param {string} opts.path
   * @param {object|string|Buffer} [opts.data]
   * @param {object} [opts.headers]
   * @returns {Promise<{status:number, data:any, headers:object}>}
   */
  async request({ method = 'GET', path, data, headers = {} }) {
    const uri = path;
    let res = await this.http.request({
      method,
      url: path,
      data,
      headers,
      validateStatus: () => true,
    });

    if (res.status === 401) {
      const challenge = parseChallenge(res.headers['www-authenticate']);
      if (!challenge) {
        throw new Error('401: Digest challenge topilmadi');
      }
      const auth = buildAuthorization({
        username: this.username,
        password: this.password,
        method,
        uri,
        challenge,
      });
      res = await this.http.request({
        method,
        url: path,
        data,
        headers: { ...headers, Authorization: auth },
        validateStatus: () => true,
      });
    }

    if (res.status >= 400) {
      const err = new Error(
        `ISAPI xato ${res.status}: ${typeof res.data === 'string' ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300)}`
      );
      err.status = res.status;
      err.data = res.data;
      throw err;
    }

    return { status: res.status, data: res.data, headers: res.headers };
  }

  /** GET /ISAPI/System/deviceInfo */
  async deviceInfo() {
    const { data } = await this.request({
      method: 'GET',
      path: '/ISAPI/System/deviceInfo?format=json',
    });
    return data;
  }

  /** GET /ISAPI/System/time — terminal vaqti va timezone */
  async time() {
    const { data } = await this.request({ method: 'GET', path: '/ISAPI/System/time?format=json' });
    return data;
  }

  /** GET /ISAPI/System/Network/interfaces — IP va boshqa ma'lumot */
  async networkInterfaces() {
    const { data } = await this.request({
      method: 'GET',
      path: '/ISAPI/System/Network/interfaces?format=json',
    });
    return data;
  }

  /** Terminalga xodim qo'shish */
  async addUser(user) {
    const { data } = await this.request({
      method: 'POST',
      path: '/ISAPI/AccessControl/UserInfo/Record?format=json',
      data: user,
    });
    return data;
  }

  /** Terminaldagi xodimni o'zgartirish */
  async modifyUser(user) {
    const { data } = await this.request({
      method: 'PUT',
      path: '/ISAPI/AccessControl/UserInfo/Modify?format=json',
      data: user,
    });
    return data;
  }

  /** Terminaldan xodimni o'chirish */
  async deleteUser(userId) {
    const { data } = await this.request({
      method: 'PUT',
      path: '/ISAPI/AccessControl/UserInfo/Delete?format=json',
      data: { UserInfo: { inUserID: userId } },
    });
    return data;
  }

  /** Yuz rasmini qo'shish (multipart) */
  async addFaceData({ userId: _userId, faceData, fileBuffer, fileName = 'face.jpg' }) {
    const form = new FormData();
    form.append('faceData', JSON.stringify(faceData), 'faceData.json');
    if (fileBuffer) {
      form.append('File', new Blob([fileBuffer], { type: 'image/jpeg' }), fileName);
    }
    const { data } = await this.request({
      method: 'POST',
      path: '/ISAPI/Intelligent/FDLib/FDUpdate?format=json',
      data: form,
      headers: { 'Content-Type': undefined },
    });
    return data;
  }

  /** Davomat loglarini o'qish (reconcile uchun) */
  async listAccessEvents(condition) {
    const { data } = await this.request({
      method: 'POST',
      path: '/ISAPI/AccessControl/AcsEvent?format=json',
      data: { AcsEventCond: condition },
    });
    return data;
  }

  /** Terminalga HTTP Host Notification (push) konfiguratsiyasini o'rnatish */
  async setHttpHost(url, parameters = {}) {
    const body = {
      HttpHostNotification: {
        url,
        protocol: 'http',
        method: 'post',
        parameters,
        timeout: 10,
        retryTimes: 3,
        retryInterval: 5,
        authentication: 'digest',
      },
    };
    const { data } = await this.request({
      method: 'PUT',
      path: '/ISAPI/Event/notification/httpHosts?format=json',
      data: body,
    });
    return data;
  }

  /** Health check */
  async ping() {
    const started = Date.now();
    await this.deviceInfo();
    return Date.now() - started;
  }
}

module.exports = HikvisionClient;
