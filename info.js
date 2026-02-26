(function () {
    const form = document.getElementById("companyInfoForm");
    const submitButton = document.getElementById("submitCompanyBtn");
    const statusMessage = document.getElementById("companyInfoStatus");

    if (!form || !submitButton || !statusMessage) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(localStorage.getItem("mountview_target_spreadsheet_id") || "").trim();

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

    async function sendToGoogleSheets(companyInfo) {
        if (!TARGET_SPREADSHEET_ID) {
            throw new Error("Missing target spreadsheet ID. Create a sheet in connect.html first.");
        }

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

        const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
            method: "POST",
            body: payload
        });

        if (!response.ok) {
            throw new Error("Failed to submit company info");
        }

        const result = await response.json();
        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error : "Apps Script rejected company info");
        }
    }

    async function onSubmit(event) {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const companyInfo = normalizeCompany(new FormData(form));
        if (companyInfo.companyName) {
            localStorage.setItem("mountview_company_name", companyInfo.companyName);
        }

        submitButton.disabled = true;
        statusMessage.className = "form-feedback";
        statusMessage.textContent = "Submitting company info...";

        try {
            await sendToGoogleSheets(companyInfo);

            form.reset();
            statusMessage.className = "form-feedback success";
            statusMessage.textContent = "Company info submitted to Google Sheets.";
        } catch (error) {
            statusMessage.className = "form-feedback error";
            statusMessage.textContent = "Could not submit company info: " + error.message;
        } finally {
            submitButton.disabled = false;
        }
    }

    form.addEventListener("submit", onSubmit);
})();
