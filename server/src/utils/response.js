'use strict';

const res = require('express').response;

/** { success: true, data: ... } */
res.ok = function ok(data, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return this.status(200).json(body);
};

/** { success: true, data: [...], pagination: {...} } */
res.list = function list(data, pagination) {
  return this.status(200).json({ success: true, data, pagination });
};

res.created = function created(data) {
  return this.status(201).json({ success: true, data });
};

res.noContent = function noContent() {
  return this.status(204).send();
};
