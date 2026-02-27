(function () {
    window.MOUNTVIEW_CONFIG = {
        // Proxy endpoint (Netlify Function) for Apps Script calls.
        googleSheetsEndpoint: "/.netlify/functions/apps-script-proxy",
        // Shared spreadsheet for this company workflow.
        spreadsheetId: "",
        // Company registry spreadsheet (company name, head account, invite link).
        registrySpreadsheetId: "1EA9mHKcQ0ZmkpzIaHp6j1bd1a7ByFyxyl4V6OmvRpKc"
    };
})();
