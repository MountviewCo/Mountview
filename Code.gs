const REQUESTS_SHEET = "Requests";
const COMPANY_SHEET = "CompanyInfo";

function doGet(e) {
  const action = getParam_(e, "action");

  if (action === "list") {
    return jsonOutput_(listRequests_(e));
  }

  return jsonOutput_({ ok: false, error: "Unsupported GET action" });
}

function doPost(e) {
  const action = getParam_(e, "action");

  if (action === "create") {
    return jsonOutput_(createRequest_(e));
  }

  if (action === "updateStatus") {
    return jsonOutput_(updateRequestStatus_(e));
  }

  if (action === "createCompany") {
    return jsonOutput_(createCompany_(e));
  }

  return jsonOutput_({ ok: false, error: "Unsupported POST action" });
}

function createRequest_(e) {
  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return { ok: false, error: "Target spreadsheet not found" };
  }

  const sheet = getOrCreateSheet_(spreadsheet, REQUESTS_SHEET, [
    "requestId",
    "name",
    "department",
    "itemName",
    "itemPrice",
    "itemAmount",
    "requestedAt",
    "status",
    "createdAt",
    "updatedAt"
  ]);

  const row = [
    getParam_(e, "requestId"),
    getParam_(e, "name"),
    getParam_(e, "department"),
    getParam_(e, "itemName"),
    Number(getParam_(e, "itemPrice") || 0),
    Number(getParam_(e, "itemAmount") || 0),
    getParam_(e, "requestedAt"),
    (getParam_(e, "status") || "pending").toLowerCase(),
    getParam_(e, "createdAt") || new Date().toISOString(),
    new Date().toISOString()
  ];

  sheet.appendRow(row);
  return { ok: true };
}

function updateRequestStatus_(e) {
  const requestId = getParam_(e, "requestId");
  const status = (getParam_(e, "status") || "pending").toLowerCase();

  if (!requestId) {
    return { ok: false, error: "Missing requestId" };
  }

  if (["pending", "approved", "rejected"].indexOf(status) === -1) {
    return { ok: false, error: "Invalid status" };
  }

  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return { ok: false, error: "Target spreadsheet not found" };
  }

  const sheet = getOrCreateSheet_(spreadsheet, REQUESTS_SHEET, [
    "requestId",
    "name",
    "department",
    "itemName",
    "itemPrice",
    "itemAmount",
    "requestedAt",
    "status",
    "createdAt",
    "updatedAt"
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: false, error: "No request rows found" };
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 10);
  const values = range.getValues();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(requestId)) {
      sheet.getRange(i + 2, 8).setValue(status);
      sheet.getRange(i + 2, 10).setValue(new Date().toISOString());
      return { ok: true };
    }
  }

  return { ok: false, error: "Request not found" };
}

function listRequests_(e) {
  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return [];
  }

  const sheet = getOrCreateSheet_(spreadsheet, REQUESTS_SHEET, [
    "requestId",
    "name",
    "department",
    "itemName",
    "itemPrice",
    "itemAmount",
    "requestedAt",
    "status",
    "createdAt",
    "updatedAt"
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  return values.map(function (row) {
    return {
      requestId: row[0],
      name: row[1],
      department: row[2],
      itemName: row[3],
      itemPrice: row[4],
      itemAmount: row[5],
      requestedAt: row[6],
      status: row[7],
      createdAt: row[8],
      updatedAt: row[9]
    };
  });
}

function createCompany_(e) {
  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return { ok: false, error: "Target spreadsheet not found" };
  }

  const sheet = getOrCreateSheet_(spreadsheet, COMPANY_SHEET, [
    "companyId",
    "companyName",
    "companyAddress",
    "stateTax",
    "annualIncome",
    "annualExpense",
    "companyEmail",
    "createdAt"
  ]);

  const row = [
    getParam_(e, "companyId"),
    getParam_(e, "companyName"),
    getParam_(e, "companyAddress"),
    getParam_(e, "stateTax"),
    Number(getParam_(e, "annualIncome") || 0),
    Number(getParam_(e, "annualExpense") || 0),
    getParam_(e, "companyEmail"),
    getParam_(e, "createdAt") || new Date().toISOString()
  ];

  sheet.appendRow(row);
  return { ok: true };
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function getSpreadsheetForRequest_(e) {
  const spreadsheetId = getParam_(e, "spreadsheetId");
  const spreadsheetName = getParam_(e, "spreadsheetName");

  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      return null;
    }
  }

  if (spreadsheetName) {
    const files = DriveApp.getFilesByName(spreadsheetName);
    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        try {
          return SpreadsheetApp.openById(file.getId());
        } catch (error) {
          return null;
        }
      }
    }
    return null;
  }

  return null;
}

function getParam_(e, key) {
  if (!e || !e.parameter) { 
    return "";
  }
  return e.parameter[key] || "";
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
