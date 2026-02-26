const REQUESTS_SHEET = "Requests";
const COMPANY_SHEET = "CompanyInfo";
const DEPARTMENTS_SHEET = "Departments";
const COMPANIES_REGISTRY_SHEET = "Companies";
const COMPANY_MEMBERS_SHEET = "CompanyMembers";

function doGet(e) {
  const action = getParam_(e, "action");

  if (action === "list") {
    return jsonOutput_(listRequests_(e));
  }

  if (action === "listDepartments") {
    return jsonOutput_(listDepartments_(e));
  }

  if (action === "getCompany") {
    return jsonOutput_(getCompany_(e));
  }

  if (action === "resolveUser") {
    return jsonOutput_(resolveUser_(e));
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
    return jsonOutput_(upsertCompany_(e));
  }

  if (action === "upsertDepartment") {
    return jsonOutput_(upsertDepartment_(e));
  }

  if (action === "createCompanyAuth") {
    return jsonOutput_(createCompanyAuth_(e));
  }

  if (action === "joinCompanyInvite") {
    return jsonOutput_(joinCompanyInvite_(e));
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
    "updatedAt",
    "decisionAt",
    "decidedBy"
  ]);

  const now = new Date().toISOString();

  const row = [
    getParam_(e, "requestId"),
    getParam_(e, "name"),
    getParam_(e, "department"),
    getParam_(e, "itemName"),
    Number(getParam_(e, "itemPrice") || 0),
    Number(getParam_(e, "itemAmount") || 0),
    getParam_(e, "requestedAt"),
    (getParam_(e, "status") || "pending").toLowerCase(),
    getParam_(e, "createdAt") || now,
    now,
    "",
    ""
  ];

  sheet.appendRow(row);
  return { ok: true };
}

function updateRequestStatus_(e) {
  const requestId = getParam_(e, "requestId");
  const status = (getParam_(e, "status") || "pending").toLowerCase();
  const decidedBy = getParam_(e, "decidedBy") || "approver";

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
    "updatedAt",
    "decisionAt",
    "decidedBy"
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: false, error: "No request rows found" };
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 12);
  const values = range.getValues();
  const now = new Date().toISOString();

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(requestId)) {
      sheet.getRange(i + 2, 8).setValue(status);
      sheet.getRange(i + 2, 10).setValue(now);
      sheet.getRange(i + 2, 11).setValue(now);
      sheet.getRange(i + 2, 12).setValue(decidedBy);
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
    "updatedAt",
    "decisionAt",
    "decidedBy"
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
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
      updatedAt: row[9],
      decisionAt: row[10],
      decidedBy: row[11]
    };
  });
}

function createCompany_(e) {
  return upsertCompany_(e);
}

function upsertCompany_(e) {
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
    "companyBudget",
    "companyEmail",
    "createdAt",
    "updatedAt"
  ]);

  const now = new Date().toISOString();
  const companyId = getParam_(e, "companyId") || "COMP-" + Date.now();
  const companyEmail = getParam_(e, "companyEmail");
  const createdAt = getParam_(e, "createdAt") || now;

  const row = [
    companyId,
    getParam_(e, "companyName"),
    getParam_(e, "companyAddress"),
    getParam_(e, "stateTax"),
    Number(getParam_(e, "annualIncome") || 0),
    Number(getParam_(e, "annualExpense") || 0),
    Number(getParam_(e, "companyBudget") || 0),
    companyEmail,
    createdAt,
    now
  ];

  const lastRow = sheet.getLastRow();
  var updated = false;
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const targetEmail = String(companyEmail || "").toLowerCase();
    for (var i = 0; i < values.length; i++) {
      const rowCompanyId = String(values[i][0] || "");
      const rowEmail = String(values[i][7] || "").toLowerCase();
      if (rowCompanyId === String(companyId) || (targetEmail && rowEmail === targetEmail)) {
        sheet.getRange(i + 2, 1, 1, 10).setValues([row]);
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    sheet.appendRow(row);
  }

  const departments = parseDepartments_(getParam_(e, "departments"));
  if (departments.length > 0) {
    const departmentSheet = getOrCreateSheet_(spreadsheet, DEPARTMENTS_SHEET, [
      "department",
      "budget",
      "companyId",
      "companyName",
      "updatedAt"
    ]);

    departments.forEach(function (departmentRow) {
      upsertDepartmentRow_(
        departmentSheet,
        departmentRow.department,
        Number(departmentRow.budget) || 0,
        companyId,
        getParam_(e, "companyName")
      );
    });
  }

  return { ok: true, companyId: companyId };
}

function upsertDepartment_(e) {
  const department = String(getParam_(e, "department") || "").trim();
  const budget = Number(getParam_(e, "budget") || 0);
  const companyId = String(getParam_(e, "companyId") || "").trim();
  const companyName = String(getParam_(e, "companyName") || "").trim();

  if (!department) {
    return { ok: false, error: "Missing department" };
  }

  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return { ok: false, error: "Target spreadsheet not found" };
  }

  const sheet = getOrCreateSheet_(spreadsheet, DEPARTMENTS_SHEET, [
    "department",
    "budget",
    "companyId",
    "companyName",
    "updatedAt"
  ]);

  upsertDepartmentRow_(sheet, department, budget, companyId, companyName);
  return { ok: true };
}

function listDepartments_(e) {
  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return [];
  }

  const sheet = getOrCreateSheet_(spreadsheet, DEPARTMENTS_SHEET, [
    "department",
    "budget",
    "companyId",
    "companyName",
    "updatedAt"
  ]);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  return values.map(function (row) {
    return {
      department: row[0],
      budget: Number(row[1]) || 0,
      companyId: row[2],
      companyName: row[3],
      updatedAt: row[4]
    };
  });
}

function getCompany_(e) {
  const spreadsheet = getSpreadsheetForRequest_(e);
  if (!spreadsheet) {
    return { ok: false, error: "Target spreadsheet not found" };
  }

  const companyId = String(getParam_(e, "companyId") || "").trim();
  const companyEmail = String(getParam_(e, "companyEmail") || "").trim().toLowerCase();
  if (!companyId && !companyEmail) {
    return { ok: false, error: "Provide companyId or companyEmail" };
  }

  const companySheet = getOrCreateSheet_(spreadsheet, COMPANY_SHEET, [
    "companyId",
    "companyName",
    "companyAddress",
    "stateTax",
    "annualIncome",
    "annualExpense",
    "companyBudget",
    "companyEmail",
    "createdAt",
    "updatedAt"
  ]);

  const lastRow = companySheet.getLastRow();
  if (lastRow < 2) {
    return { ok: false, error: "Company not found" };
  }

  const rows = companySheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var company = null;
  for (var i = 0; i < rows.length; i++) {
    const rowId = String(rows[i][0] || "");
    const rowEmail = String(rows[i][7] || "").toLowerCase();
    if ((companyId && rowId === companyId) || (companyEmail && rowEmail === companyEmail)) {
      company = {
        companyId: rows[i][0],
        companyName: rows[i][1],
        companyAddress: rows[i][2],
        stateTax: rows[i][3],
        annualIncome: Number(rows[i][4]) || 0,
        annualExpense: Number(rows[i][5]) || 0,
        companyBudget: Number(rows[i][6]) || 0,
        companyEmail: rows[i][7],
        createdAt: rows[i][8],
        updatedAt: rows[i][9]
      };
      break;
    }
  }

  if (!company) {
    return { ok: false, error: "Company not found" };
  }

  const departments = listDepartments_(e).filter(function (row) {
    return String(row.companyId || "") === String(company.companyId);
  });

  company.departments = departments.map(function (row) {
    return {
      department: row.department,
      budget: row.budget
    };
  });

  return { ok: true, company: company };
}

function resolveUser_(e) {
  const registry = getRegistrySpreadsheet_(e);
  if (!registry) {
    return { ok: false, error: "Registry spreadsheet not found" };
  }

  const email = String(getParam_(e, "email") || "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "Missing email" };
  }

  const companiesSheet = getOrCreateSheet_(registry, COMPANIES_REGISTRY_SHEET, [
    "companyId",
    "companyName",
    "headEmail",
    "companySpreadsheetId",
    "inviteCode",
    "inviteLink",
    "createdAt",
    "updatedAt"
  ]);
  const membersSheet = getOrCreateSheet_(registry, COMPANY_MEMBERS_SHEET, [
    "companyId",
    "email",
    "role",
    "joinedAt",
    "updatedAt"
  ]);

  const member = findMemberByEmail_(membersSheet, email);
  if (member) {
    const company = findCompanyById_(companiesSheet, member.companyId);
    if (company) {
      return {
        ok: true,
        role: member.role,
        companyId: company.companyId,
        companyName: company.companyName,
        companySpreadsheetId: company.companySpreadsheetId,
        inviteLink: company.inviteLink
      };
    }
  }

  const headed = findCompanyByHeadEmail_(companiesSheet, email);
  if (headed) {
    upsertMemberRow_(membersSheet, headed.companyId, email, "approver");
    return {
      ok: true,
      role: "approver",
      companyId: headed.companyId,
      companyName: headed.companyName,
      companySpreadsheetId: headed.companySpreadsheetId,
      inviteLink: headed.inviteLink
    };
  }

  return { ok: false, error: "No company membership found for this email" };
}

function createCompanyAuth_(e) {
  const registry = getRegistrySpreadsheet_(e);
  if (!registry) {
    return { ok: false, error: "Registry spreadsheet not found" };
  }

  const companyName = String(getParam_(e, "companyName") || "").trim();
  const headEmail = String(getParam_(e, "headEmail") || "").trim().toLowerCase();
  const companySpreadsheetId = String(getParam_(e, "companySpreadsheetId") || "").trim();
  const inviteBaseUrl = String(getParam_(e, "inviteBaseUrl") || "").trim();

  if (!companyName) {
    return { ok: false, error: "Missing companyName" };
  }
  if (!headEmail) {
    return { ok: false, error: "Missing headEmail" };
  }
  if (!companySpreadsheetId) {
    return { ok: false, error: "Missing companySpreadsheetId" };
  }

  const companiesSheet = getOrCreateSheet_(registry, COMPANIES_REGISTRY_SHEET, [
    "companyId",
    "companyName",
    "headEmail",
    "companySpreadsheetId",
    "inviteCode",
    "inviteLink",
    "createdAt",
    "updatedAt"
  ]);
  const membersSheet = getOrCreateSheet_(registry, COMPANY_MEMBERS_SHEET, [
    "companyId",
    "email",
    "role",
    "joinedAt",
    "updatedAt"
  ]);

  const existing = findCompanyByHeadEmail_(companiesSheet, headEmail);
  if (existing) {
    upsertMemberRow_(membersSheet, existing.companyId, headEmail, "approver");
    return {
      ok: true,
      role: "approver",
      companyId: existing.companyId,
      companyName: existing.companyName,
      companySpreadsheetId: existing.companySpreadsheetId,
      inviteLink: existing.inviteLink
    };
  }

  const now = new Date().toISOString();
  const companyId = "COMP-" + Date.now();
  const inviteCode = "INV-" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  const inviteLink = inviteBaseUrl
    ? inviteBaseUrl + "?invite=" + encodeURIComponent(inviteCode)
    : inviteCode;

  companiesSheet.appendRow([
    companyId,
    companyName,
    headEmail,
    companySpreadsheetId,
    inviteCode,
    inviteLink,
    now,
    now
  ]);

  upsertMemberRow_(membersSheet, companyId, headEmail, "approver");

  return {
    ok: true,
    role: "approver",
    companyId: companyId,
    companyName: companyName,
    companySpreadsheetId: companySpreadsheetId,
    inviteLink: inviteLink
  };
}

function joinCompanyInvite_(e) {
  const registry = getRegistrySpreadsheet_(e);
  if (!registry) {
    return { ok: false, error: "Registry spreadsheet not found" };
  }

  const inviteCode = String(getParam_(e, "inviteCode") || "").trim();
  const email = String(getParam_(e, "email") || "").trim().toLowerCase();
  if (!inviteCode) {
    return { ok: false, error: "Missing inviteCode" };
  }
  if (!email) {
    return { ok: false, error: "Missing email" };
  }

  const companiesSheet = getOrCreateSheet_(registry, COMPANIES_REGISTRY_SHEET, [
    "companyId",
    "companyName",
    "headEmail",
    "companySpreadsheetId",
    "inviteCode",
    "inviteLink",
    "createdAt",
    "updatedAt"
  ]);
  const membersSheet = getOrCreateSheet_(registry, COMPANY_MEMBERS_SHEET, [
    "companyId",
    "email",
    "role",
    "joinedAt",
    "updatedAt"
  ]);

  const company = findCompanyByInviteCode_(companiesSheet, inviteCode);
  if (!company) {
    return { ok: false, error: "Invalid invite code" };
  }

  const role = String(email) === String(company.headEmail) ? "approver" : "requester";
  upsertMemberRow_(membersSheet, company.companyId, email, role);

  return {
    ok: true,
    role: role,
    companyId: company.companyId,
    companyName: company.companyName,
    companySpreadsheetId: company.companySpreadsheetId,
    inviteLink: company.inviteLink
  };
}

function parseDepartments_(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(function (row) {
        return {
          department: String((row && row.department) || "").trim(),
          budget: Number((row && row.budget) || 0)
        };
      })
      .filter(function (row) {
        return row.department.length > 0;
      });
  } catch (error) {
    return [];
  }
}

function upsertDepartmentRow_(sheet, department, budget, companyId, companyName) {
  const now = new Date().toISOString();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    sheet.appendRow([department, budget, companyId, companyName, now]);
    return;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const departmentKey = String(department || "").toLowerCase();
  const companyKey = String(companyId || "");

  for (var i = 0; i < values.length; i++) {
    const rowDepartment = String(values[i][0] || "").toLowerCase();
    const rowCompanyId = String(values[i][2] || "");
    if (rowDepartment === departmentKey && rowCompanyId === companyKey) {
      sheet.getRange(i + 2, 1, 1, 5).setValues([[department, budget, companyId, companyName, now]]);
      return;
    }
  }

  sheet.appendRow([department, budget, companyId, companyName, now]);
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (!existingHeaders[i]) {
        sheet.getRange(1, i + 1).setValue(headers[i]);
      }
    }
  }

  return sheet;
}

function getRegistrySpreadsheet_(e) {
  const registryId = String(getParam_(e, "registrySpreadsheetId") || "").trim();
  if (!registryId) {
    return null;
  }
  try {
    return SpreadsheetApp.openById(registryId);
  } catch (error) {
    return null;
  }
}

function findCompanyById_(sheet, companyId) {
  const target = String(companyId || "").trim();
  if (!target) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === target) {
      return {
        companyId: rows[i][0],
        companyName: rows[i][1],
        headEmail: String(rows[i][2] || "").toLowerCase(),
        companySpreadsheetId: rows[i][3],
        inviteCode: rows[i][4],
        inviteLink: rows[i][5]
      };
    }
  }
  return null;
}

function findCompanyByHeadEmail_(sheet, email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][2] || "").toLowerCase() === target) {
      return {
        companyId: rows[i][0],
        companyName: rows[i][1],
        headEmail: String(rows[i][2] || "").toLowerCase(),
        companySpreadsheetId: rows[i][3],
        inviteCode: rows[i][4],
        inviteLink: rows[i][5]
      };
    }
  }
  return null;
}

function findCompanyByInviteCode_(sheet, inviteCode) {
  const target = String(inviteCode || "").trim();
  if (!target) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][4] || "") === target) {
      return {
        companyId: rows[i][0],
        companyName: rows[i][1],
        headEmail: String(rows[i][2] || "").toLowerCase(),
        companySpreadsheetId: rows[i][3],
        inviteCode: rows[i][4],
        inviteLink: rows[i][5]
      };
    }
  }
  return null;
}

function findMemberByEmail_(sheet, email) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1] || "").toLowerCase() === target) {
      return {
        companyId: rows[i][0],
        email: String(rows[i][1] || "").toLowerCase(),
        role: String(rows[i][2] || "requester").toLowerCase()
      };
    }
  }
  return null;
}

function upsertMemberRow_(sheet, companyId, email, role) {
  const now = new Date().toISOString();
  const targetCompanyId = String(companyId || "").trim();
  const targetEmail = String(email || "").trim().toLowerCase();
  const targetRole = String(role || "requester").toLowerCase();

  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var i = 0; i < rows.length; i++) {
      const rowCompanyId = String(rows[i][0] || "");
      const rowEmail = String(rows[i][1] || "").toLowerCase();
      if (rowCompanyId === targetCompanyId && rowEmail === targetEmail) {
        sheet.getRange(i + 2, 1, 1, 5).setValues([[
          targetCompanyId,
          targetEmail,
          targetRole,
          rows[i][3] || now,
          now
        ]]);
        return;
      }
    }
  }

  sheet.appendRow([targetCompanyId, targetEmail, targetRole, now, now]);
}

function getSpreadsheetForRequest_(e) {
  const spreadsheetId = getParam_(e, "spreadsheetId");

  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      return null;
    }
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
