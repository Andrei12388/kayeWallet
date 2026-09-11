/**
 * KathLedger Google Apps Script API.
 * Bind this script to the spreadsheet, then deploy it as a Web app.
 * Expected sheets: TRANSACTIONS, CATEGORIES, ALLOCATIONS, FUNDS, SETTINGS.
 * TRANSACTION_ALLOCATIONS is created automatically for income snapshots.
 */

const SHEETS = {
  TRANSACTIONS: 'TRANSACTIONS',
  CATEGORIES: 'CATEGORIES',
  ALLOCATIONS: 'ALLOCATIONS',
  FUNDS: 'FUNDS',
  SETTINGS: 'SETTINGS',
  TRANSACTION_ALLOCATIONS: 'TRANSACTION_ALLOCATIONS',
};

const SNAPSHOT_HEADERS = [
  'id',
  'transactionId',
  'incomeCategoryId',
  'fundName',
  'percentage',
  'amount',
  'createdAt',
];

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'getTransactions');
    const result = routeGet_(action, e ? e.parameter : {});
    return json_({ ok: true, data: result });
  } catch (error) {
    return errorResponse_(error);
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = String(body.action || 'createTransaction');
    const result = routePost_(action, body);
    return json_({ ok: true, data: result });
  } catch (error) {
    return errorResponse_(error);
  }
}

function routeGet_(action, params) {
  switch (action) {
    case 'getTransactions':
      return getTransactions_(params);
    case 'getCategories':
      return publicRows_(readSheet_(SHEETS.CATEGORIES));
    case 'getAllocations':
      return getAllocations_(params.incomeCategoryId || '');
    case 'getFunds':
      return publicRows_(readSheet_(SHEETS.FUNDS));
    case 'getDashboard':
      return getDashboard_();
    case 'getReports':
      return getReports_(params); 
    default:
      throw new Error('Unknown GET action: ' + action);
  }
}

function routePost_(action, body) {
  switch (action) {
    case 'createTransaction':
      return createTransaction_(body);
    case 'updateTransaction':
      return updateTransaction_(body);
    case 'deleteTransaction':
      return deleteTransaction_(body);
    case 'createCategory':
      return createCategory_(body);
    case 'updateCategory':
      return updateCategory_(body);
    case 'deleteCategory':
      return deleteCategory_(body);
    case 'saveAllocations':
      return saveAllocations_(body);
    default:
      throw new Error('Unknown POST action: ' + action);
  }
}

function getTransactions_(params) {
  let transactions = readSheet_(SHEETS.TRANSACTIONS);
  if (params.type) {
    transactions = transactions.filter(function (row) {
      return String(row.type).toUpperCase() === String(params.type).toUpperCase();
    });
  }
  return publicRows_(transactions.sort(function (a, b) {
    return String(b.date).localeCompare(String(a.date));
  }));
}

function getAllocations_(incomeCategoryId) {
  const rows = readSheet_(SHEETS.ALLOCATIONS).filter(function (row) {
    const active = row.active === true || String(row.active).toUpperCase() === 'TRUE';
    const matchesCategory = !incomeCategoryId || String(row.incomeCategoryId) === String(incomeCategoryId);
    return active && matchesCategory;
  });
  return rows.map(function (row) {
    return {
      id: row.id,
      incomeCategoryId: row.incomeCategoryId,
      fundName: row.fundName,
      percentage: Number(row.percentage),
      active: true,
    };
  });
}

function createTransaction_(body) {
  const type = String(body.type || '').toUpperCase();
  const categoryId = String(body.categoryId || '').trim();
  const description = String(body.description || '').trim();
  const amount = Number(body.amount);
  const date = String(body.date || Utilities.formatDate(new Date(), getTimeZone_(), 'yyyy-MM-dd'));

  if (['INCOME', 'EXPENSE'].indexOf(type) === -1) throw new Error('type must be INCOME or EXPENSE.');
  if (!categoryId) throw new Error('categoryId is required.');
  if (!description) throw new Error('description is required.');
  if (!isFinite(amount) || amount <= 0) throw new Error('amount must be greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must use YYYY-MM-DD.');

  const category = readSheet_(SHEETS.CATEGORIES).find(function (row) {
    return String(row.id) === categoryId && String(row.type).toUpperCase() === type && isActive_(row.active);
  });
  if (!category) throw new Error('Active category was not found for this transaction type.');

  const transaction = {
    id: nextId_(SHEETS.TRANSACTIONS, 'TXN'),
    date: date,
    type: type,
    categoryId: categoryId,
    description: description,
    amount: roundMoney_(amount),
  };

  const transactionSheet = getSheet_(SHEETS.TRANSACTIONS);
  appendObject_(transactionSheet, transaction);

  let snapshots = [];
  if (type === 'INCOME') {
    snapshots = createAllocationSnapshots_(transaction);
  }
  return { transaction: transaction, allocationSnapshots: snapshots };
}

function updateTransaction_(body) {
  const id = String(body.id || '').trim();
  if (!id) throw new Error('Transaction id is required.');
  const existing = readSheet_(SHEETS.TRANSACTIONS).find(function (row) { return String(row.id) === id; });
  if (!existing) throw new Error('Transaction was not found.');
  const type = String(body.type || existing.type).toUpperCase();
  const categoryId = String(body.categoryId || existing.categoryId).trim();
  const description = String(body.description || existing.description).trim();
  const amount = Number(body.amount === undefined ? existing.amount : body.amount);
  const date = String(body.date || existing.date);
  if (['INCOME', 'EXPENSE'].indexOf(type) === -1 || !categoryId || !description || !isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid transaction data.');
  const category = readSheet_(SHEETS.CATEGORIES).find(function (row) { return String(row.id) === categoryId && String(row.type).toUpperCase() === type && isActive_(row.active); });
  if (!category) throw new Error('Active category was not found for this transaction type.');
  const sheet = getSheet_(SHEETS.TRANSACTIONS);
  updateObject_(sheet, existing._rowNumber, { date: date, type: type, categoryId: categoryId, description: description, amount: roundMoney_(amount) });
  deleteSnapshotsForTransaction_(id);
  if (type === 'INCOME') {
    createAllocationSnapshots_({ id: id, date: date, type: type, categoryId: categoryId, description: description, amount: roundMoney_(amount) });
  }
  return { id: id, date: date, type: type, categoryId: categoryId, description: description, amount: roundMoney_(amount) };
}

function deleteTransaction_(body) {
  const id = String(body.id || '').trim();
  const sheet = getSheet_(SHEETS.TRANSACTIONS);
  const row = readSheet_(SHEETS.TRANSACTIONS).find(function (item) { return String(item.id) === id; });
  if (!row) throw new Error('Transaction was not found.');
  sheet.deleteRow(row._rowNumber);
  deleteSnapshotsForTransaction_(id);
  return { id: id };
}

function deleteSnapshotsForTransaction_(transactionId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.TRANSACTION_ALLOCATIONS);
  if (!sheet) return;
  readSheet_(SHEETS.TRANSACTION_ALLOCATIONS).filter(function (row) { return String(row.transactionId) === transactionId; }).sort(function (a, b) { return b._rowNumber - a._rowNumber; }).forEach(function (row) { sheet.deleteRow(row._rowNumber); });
}

function createCategory_(body) {
  const type = String(body.type || '').toUpperCase();
  const name = String(body.name || '').trim();
  if (['INCOME', 'EXPENSE'].indexOf(type) === -1 || !name) throw new Error('Category type and name are required.');
  const rows = readSheet_(SHEETS.CATEGORIES);
  if (rows.some(function (row) { return String(row.name).toLowerCase() === name.toLowerCase() && String(row.type).toUpperCase() === type && isActive_(row.active); })) throw new Error('That category already exists.');
  const category = { id: nextId_(SHEETS.CATEGORIES, type === 'INCOME' ? 'INC' : 'EXP'), type: type, name: name, active: true };
  appendObject_(getSheet_(SHEETS.CATEGORIES), category);
  return category;
}

function updateCategory_(body) {
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const type = String(body.type || '').toUpperCase();
  if (!id || !name || ['INCOME', 'EXPENSE'].indexOf(type) === -1) throw new Error('Category id, type, and name are required.');
  const rows = readSheet_(SHEETS.CATEGORIES);
  const row = rows.find(function (item) { return String(item.id) === id; });
  if (!row) throw new Error('Category was not found.');
  updateObject_(getSheet_(SHEETS.CATEGORIES), row._rowNumber, { type: type, name: name, active: body.active === undefined ? row.active : Boolean(body.active) });
  return { id: id, type: type, name: name, active: body.active === undefined ? row.active : Boolean(body.active) };
}

function deleteCategory_(body) {
  const id = String(body.id || '').trim();
  const row = readSheet_(SHEETS.CATEGORIES).find(function (item) { return String(item.id) === id; });
  if (!row) throw new Error('Category was not found.');
  updateObject_(getSheet_(SHEETS.CATEGORIES), row._rowNumber, { active: false });
  return { id: id };
}

function createAllocationSnapshots_(transaction) {
  const allocations = getAllocations_(transaction.categoryId);
  if (!allocations.length) return [];

  const total = allocations.reduce(function (sum, row) { return sum + row.percentage; }, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new Error('Active allocations for this income category must total 100%.');
  }

  const sheet = getOrCreateSheet_(SHEETS.TRANSACTION_ALLOCATIONS, SNAPSHOT_HEADERS);
  let allocated = 0;
  const snapshots = allocations.map(function (allocation, index) {
    const snapshotAmount = index === allocations.length - 1
      ? roundMoney_(transaction.amount - allocated)
      : roundMoney_(transaction.amount * allocation.percentage / 100);
    allocated += snapshotAmount;
    return {
      id: nextId_(SHEETS.TRANSACTION_ALLOCATIONS, 'TA'),
      transactionId: transaction.id,
      incomeCategoryId: transaction.categoryId,
      fundName: allocation.fundName,
      percentage: allocation.percentage,
      amount: snapshotAmount,
      createdAt: new Date().toISOString(),
    };
  });
  snapshots.forEach(function (snapshot) { appendObject_(sheet, snapshot); });
  return snapshots;
}

function saveAllocations_(body) {
  const incomeCategoryId = String(body.incomeCategoryId || '').trim();
  const incoming = Array.isArray(body.allocations) ? body.allocations : [];
  if (!incomeCategoryId || !incoming.length) throw new Error('incomeCategoryId and allocations are required.');

  const allocations = incoming.map(function (item) {
    const percentage = Number(item.percentage);
    if (!String(item.fundName || '').trim() || !isFinite(percentage) || percentage < 0) {
      throw new Error('Each allocation needs a fundName and a non-negative percentage.');
    }
    return { fundName: String(item.fundName).trim(), percentage: percentage };
  });
  const total = allocations.reduce(function (sum, row) { return sum + row.percentage; }, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error('Allocations must total 100%.');

  const sheet = getSheet_(SHEETS.ALLOCATIONS);
  const rows = readSheet_(SHEETS.ALLOCATIONS);
  const existing = {};
  rows.forEach(function (row) {
    if (String(row.incomeCategoryId) === incomeCategoryId) existing[row.id] = row;
  });

  const now = new Date().toISOString();
  allocations.forEach(function (allocation) {
    const row = rows.find(function (item) {
      return String(item.incomeCategoryId) === incomeCategoryId && String(item.fundName) === allocation.fundName;
    });
    if (row) {
      updateObject_(sheet, row._rowNumber, { percentage: allocation.percentage, active: true });
      delete existing[row.id];
    } else {
      appendObject_(sheet, { id: nextId_(SHEETS.ALLOCATIONS, 'ALLOC'), incomeCategoryId: incomeCategoryId, fundName: allocation.fundName, percentage: allocation.percentage, active: true, updatedAt: now });
    }
  });
  Object.keys(existing).forEach(function (id) {
    updateObject_(sheet, existing[id]._rowNumber, { active: false, updatedAt: now });
  });
  return getAllocations_(incomeCategoryId);
}

function getDashboard_() {
  const transactions = getTransactions_({});
  const income = transactions.filter(function (row) { return row.type === 'INCOME'; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
  const expenses = transactions.filter(function (row) { return row.type === 'EXPENSE'; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
  const snapshots = readSheet_(SHEETS.TRANSACTION_ALLOCATIONS);
  const allocationTotals = {};
  snapshots.forEach(function (row) { allocationTotals[row.fundName] = (allocationTotals[row.fundName] || 0) + Number(row.amount || 0); });
  return { totalIncome: roundMoney_(income), totalExpenses: roundMoney_(expenses), balance: roundMoney_(income - expenses), allocationTotals: allocationTotals };
}

function getReports_(params) {
  const transactions = getTransactions_({});
  const period = String(params.period || 'month').toLowerCase();
  const now = new Date();
  const filtered = transactions.filter(function (row) {
    const date = new Date(String(row.date) + 'T00:00:00');
    if (period === 'day') return date.toDateString() === now.toDateString();
    if (period === 'year') return date.getFullYear() === now.getFullYear();
    if (period === 'week') return (now - date) <= 7 * 24 * 60 * 60 * 1000;
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const income = filtered.filter(function (row) { return row.type === 'INCOME'; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
  const expenses = filtered.filter(function (row) { return row.type === 'EXPENSE'; }).reduce(function (sum, row) { return sum + Number(row.amount || 0); }, 0);
  return { period: period, income: roundMoney_(income), expenses: roundMoney_(expenses), net: roundMoney_(income - expenses), transactions: publicRows_(filtered) };
}

function publicRows_(rows) {
  return rows.map(function (row) {
    const copy = {};
    Object.keys(row).forEach(function (key) {
      if (key !== '_rowNumber') copy[key] = row[key];
    });
    return copy;
  });
}

function readSheet_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (header) { return String(header).trim(); });
  return values.slice(1).map(function (row, index) {
    const object = { _rowNumber: index + 2 };
    headers.forEach(function (header, column) {
      object[header] = normalizeValue_(row[column], header);
    });
    return object;
  }).filter(function (row) {
    return Object.keys(row).some(function (key) { return key !== '_rowNumber' && row[key] !== ''; });
  });
}

function appendObject_(sheet, object) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  sheet.appendRow(headers.map(function (header) { return object[header] === undefined ? '' : object[header]; }));
}

function updateObject_(sheet, rowNumber, changes) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (header, index) {
    if (changes[header] !== undefined) current[index] = changes[header];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
}

function nextId_(sheetName, prefix) {
  const rows = readSheet_(sheetName);
  const max = rows.reduce(function (highest, row) {
    const match = String(row.id || '').match(new RegExp('^' + prefix + '-(\\d+)$'));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return prefix + '-' + String(max + 1).padStart(3, '0');
}

function getSheet_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  return sheet;
}

function getOrCreateSheet_(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('POST body is required.');
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (error) { throw new Error('POST body must be valid JSON.'); }
  if (!body || typeof body !== 'object') throw new Error('POST body must be an object.');
  return body;
}

function normalizeValue_(value, header) {
  if (value instanceof Date) return Utilities.formatDate(value, getTimeZone_(), header === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss'Z'");
  if (header === 'active' && typeof value === 'boolean') return value;
  return value;
}

function isActive_(value) { return value === true || String(value).toUpperCase() === 'TRUE'; }
function roundMoney_(value) { return Math.round(Number(value) * 100) / 100; }
function getTimeZone_() { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Manila'; }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function errorResponse_(error) { return json_({ ok: false, error: error && error.message ? error.message : String(error) }); }
