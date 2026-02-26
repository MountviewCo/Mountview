(function () {
    const form = document.getElementById("companyInfoForm");
    const submitButton = document.getElementById("submitCompanyBtn");
    const statusMessage = document.getElementById("companyInfoStatus");

    if (!form || !submitButton || !statusMessage) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(config.spreadsheetId || "").trim();
    const TARGET_SPREADSHEET_NAME = String(config.spreadsheetName || "").trim();
    const LOCAL_STORE_KEY = "mountview_company_info";

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function normalizeCompany(formData) {
        return {
            companyId: "COMP-" + Date.now(),
            companyName: String(formData.get("companyName") || "").trim(),
            companyAddress: String(formData.get("companyAddress") || "").trim(),
            stateTax: String(formData.get("stateTax") || "").trim(),
            annualIncome: toNumber(formData.get("annualIncome")),
            annualExpense: toNumber(formData.get("annualExpense")),
            companyEmail: String(formData.get("companyEmail") || "").trim(),
            createdAt: new Date().toISOString()
        };
    }

    function saveLocal(companyInfo) {
        const rows = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
        rows.push(companyInfo);
        localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(rows));
    }

    async function sendToGoogleSheets(companyInfo) {
        const payload = new URLSearchParams({
            action: "createCompany",
            companyId: companyInfo.companyId,
            companyName: companyInfo.companyName,
            companyAddress: companyInfo.companyAddress,
            stateTax: companyInfo.stateTax,
            annualIncome: String(companyInfo.annualIncome),
            annualExpense: String(companyInfo.annualExpense),
            companyEmail: companyInfo.companyEmail,
            createdAt: companyInfo.createdAt
        });
        if (TARGET_SPREADSHEET_ID) {
            payload.set("spreadsheetId", TARGET_SPREADSHEET_ID);
        }
        if (TARGET_SPREADSHEET_NAME) {
            payload.set("spreadsheetName", TARGET_SPREADSHEET_NAME);
        }

        const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
            method: "POST",
            body: payload
        });

        if (!response.ok) {
            throw new Error("Failed to submit company info");
        }
    }

    async function onSubmit(event) {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const companyInfo = normalizeCompany(new FormData(form));

        submitButton.disabled = true;
        statusMessage.className = "form-feedback";
        statusMessage.textContent = "Submitting company info...";

        try {
            if (GOOGLE_SHEETS_ENDPOINT) {
                await sendToGoogleSheets(companyInfo);
            } else {
                saveLocal(companyInfo);
            }

            form.reset();
            statusMessage.className = "form-feedback success";
            statusMessage.textContent = GOOGLE_SHEETS_ENDPOINT
                ? "Company info submitted to Google Sheets."
                : "Company info saved locally. Add your Apps Script URL in config.js.";
        } catch (error) {
            statusMessage.className = "form-feedback error";
            statusMessage.textContent = "Could not submit company info. Check your Apps Script endpoint.";
        } finally {
            submitButton.disabled = false;
        }
    }

    form.addEventListener("submit", onSubmit);
})();
