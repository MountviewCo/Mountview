(function () {
    const form = document.getElementById("requestForm");
    const requestStatus = document.getElementById("requestStatus");
    const submitButton = document.getElementById("submitRequestBtn");
    const priceInput = document.getElementById("itemPrice");
    const amountInput = document.getElementById("itemAmount");
    const totalOutput = document.getElementById("estimatedTotal");
    const requestedAtInput = document.getElementById("requestedAt");
    const userMeta = document.getElementById("requestUserMeta");
    const signOutButton = document.getElementById("requestSignOutBtn");

    if (!form || !requestStatus || !submitButton || !priceInput || !amountInput || !totalOutput || !requestedAtInput) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(localStorage.getItem("mountview_target_spreadsheet_id") || config.spreadsheetId || "").trim();

    function setStatus(message, kind) {
        requestStatus.className = "form-feedback" + (kind ? " " + kind : "");
        requestStatus.textContent = message;
    }

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

    async function sendToGoogleSheets(request) {
        if (!GOOGLE_SHEETS_ENDPOINT) {
            throw new Error("Missing googleSheetsEndpoint in config.js");
        }
        if (!TARGET_SPREADSHEET_ID) {
            throw new Error("Missing spreadsheetId. Set it in config.js or connect first.");
        }

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
            createdAt: request.createdAt,
            spreadsheetId: TARGET_SPREADSHEET_ID
        });

        const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
            method: "POST",
            body: payload
        });

        if (!response.ok) {
            throw new Error("Request submission failed");
        }

        const result = await response.json();
        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error : "Apps Script rejected request");
        }
    }

    async function enforceRole() {
        const response = await fetch("/.netlify/functions/google-session");
        if (!response.ok) {
            window.location.href = "/info.html";
            return false;
        }

        const session = await response.json();
        if (!session.authenticated) {
            window.location.href = "/info.html";
            return false;
        }

        const role = String(localStorage.getItem("mountview_user_role") || "");
        if (!role) {
            window.location.href = "/info.html";
            return false;
        }

        if (role === "approver") {
            window.location.href = "/accept.html";
            return false;
        }

        if (userMeta) {
            userMeta.textContent = "Signed in: " + (session.email || "requester");
        }
        return true;
    }

    async function onSubmit(event) {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const request = normalizeRequest(new FormData(form));
        submitButton.disabled = true;
        setStatus("Submitting request...");

        try {
            await sendToGoogleSheets(request);
            form.reset();
            requestedAtInput.value = toLocalDateTimeValue(new Date());
            updateTotal();
            setStatus("Request submitted.", "success");
        } catch (error) {
            setStatus("Unable to submit request: " + error.message, "error");
        } finally {
            submitButton.disabled = false;
        }
    }

    requestedAtInput.value = toLocalDateTimeValue(new Date());
    priceInput.addEventListener("input", updateTotal);
    amountInput.addEventListener("input", updateTotal);
    form.addEventListener("submit", onSubmit);
    updateTotal();

    if (signOutButton) {
        signOutButton.addEventListener("click", function () {
            window.location.href = "/.netlify/functions/google-logout";
        });
    }

    enforceRole().catch(function () {
        window.location.href = "/info.html";
    });
})();
