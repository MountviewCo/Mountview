(function () {
    const form = document.getElementById("requestForm");
    const requestStatus = document.getElementById("requestStatus");
    const submitButton = document.getElementById("submitRequestBtn");
    const priceInput = document.getElementById("itemPrice");
    const amountInput = document.getElementById("itemAmount");
    const totalOutput = document.getElementById("estimatedTotal");
    const requestedAtInput = document.getElementById("requestedAt");

    if (!form || !requestStatus || !submitButton || !priceInput || !amountInput || !totalOutput || !requestedAtInput) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(config.spreadsheetId || "").trim();
    const TARGET_SPREADSHEET_NAME = String(config.spreadsheetName || "").trim();
    const LOCAL_STORE_KEY = "mountview_requests";

    requestedAtInput.value = toLocalDateTimeValue(new Date());

    function toLocalDateTimeValue(date) {
        const pad = function (value) {
            return String(value).padStart(2, "0");
        };

        return [
            date.getFullYear(),
            "-",
            pad(date.getMonth() + 1),
            "-",
            pad(date.getDate()),
            "T",
            pad(date.getHours()),
            ":",
            pad(date.getMinutes())
        ].join("");
    }

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(number);
    }

    function updateTotal() {
        const price = Number(priceInput.value) || 0;
        const amount = Number(amountInput.value) || 0;
        totalOutput.textContent = formatCurrency(price * amount);
    }

    function normalizeRequest(formData) {
        const price = Number(formData.get("itemPrice"));
        const amount = Number(formData.get("itemAmount"));

        return {
            requestId: "REQ-" + Date.now(),
            name: String(formData.get("requesterName") || "").trim(),
            department: String(formData.get("department") || "").trim(),
            itemName: String(formData.get("itemName") || "").trim(),
            itemPrice: Number.isFinite(price) ? price : 0,
            itemAmount: Number.isFinite(amount) ? amount : 0,
            requestedAt: new Date(String(formData.get("requestedAt") || "")).toISOString(),
            status: "pending",
            createdAt: new Date().toISOString()
        };
    }

    function saveLocal(request) {
        const existing = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
        existing.push(request);
        localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(existing));
    }

    async function sendToGoogleSheets(request) {
        const payload = new URLSearchParams({
            action: "create",
            requestId: request.requestId,
            name: request.name,
            department: request.department,
            itemName: request.itemName,
            itemPrice: String(request.itemPrice),
            itemAmount: String(request.itemAmount),
            requestedAt: request.requestedAt,
            status: request.status,
            createdAt: request.createdAt
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
            throw new Error("Request submission failed");
        }

        return response;
    }

    async function onSubmit(event) {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const request = normalizeRequest(formData);

        submitButton.disabled = true;
        requestStatus.className = "form-feedback";
        requestStatus.textContent = "Submitting request...";

        try {
            if (GOOGLE_SHEETS_ENDPOINT) {
                await sendToGoogleSheets(request);
            } else {
                saveLocal(request);
            }

            form.reset();
            requestedAtInput.value = toLocalDateTimeValue(new Date());
            updateTotal();
            requestStatus.className = "form-feedback success";
            requestStatus.textContent = GOOGLE_SHEETS_ENDPOINT
                ? "Request submitted to Google Sheets."
                : "Request saved locally. Add your Apps Script URL in config.js.";
        } catch (error) {
            requestStatus.className = "form-feedback error";
            requestStatus.textContent = "Unable to submit request. Please verify your Apps Script endpoint.";
        } finally {
            submitButton.disabled = false;
        }
    }

    priceInput.addEventListener("input", updateTotal);
    amountInput.addEventListener("input", updateTotal);
    form.addEventListener("submit", onSubmit);
    updateTotal();
})();
