(function () {
    const approvalList = document.getElementById("approvalList");

    if (!approvalList) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(localStorage.getItem("mountview_target_spreadsheet_id") || "").trim();
    const LOCAL_STORE_KEY = "mountview_requests";

    function getEndpointWithTargetParams(action) {
        const url = new URL(GOOGLE_SHEETS_ENDPOINT);
        url.searchParams.set("action", action);
        if (TARGET_SPREADSHEET_ID) {
            url.searchParams.set("spreadsheetId", TARGET_SPREADSHEET_ID);
        }
        return url.toString();
    }

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(number);
    }

    function formatDate(dateValue) {
        if (!dateValue) {
            return "-";
        }

        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) {
            return "-";
        }

        return date.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function sanitizeStatus(status) {
        const value = String(status || "pending").toLowerCase();
        if (value === "approved" || value === "rejected" || value === "pending") {
            return value;
        }

        return "pending";
    }

    function readLocalRequests() {
        const rows = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
        return Array.isArray(rows) ? rows : [];
    }

    async function fetchGoogleRequests() {
        const response = await fetch(getEndpointWithTargetParams("list"), {
            method: "GET"
        });

        if (!response.ok) {
            throw new Error("Failed to load requests");
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            return [];
        }

        return data;
    }

    async function loadRequests() {
        if (GOOGLE_SHEETS_ENDPOINT) {
            return fetchGoogleRequests();
        }

        return readLocalRequests();
    }

    function saveLocalStatus(requestId, nextStatus) {
        const rows = readLocalRequests().map(function (row) {
            if (row.requestId === requestId) {
                return Object.assign({}, row, { status: nextStatus });
            }
            return row;
        });

        localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(rows));
    }

    async function sendStatusUpdate(requestId, nextStatus) {
        const payload = new URLSearchParams({
            action: "updateStatus",
            requestId: requestId,
            status: nextStatus
        });
        if (TARGET_SPREADSHEET_ID) {
            payload.set("spreadsheetId", TARGET_SPREADSHEET_ID);
        }

        const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
            method: "POST",
            body: payload
        });

        if (!response.ok) {
            throw new Error("Failed to update status");
        }
    }

    async function updateStatus(request, nextStatus) {
        if (GOOGLE_SHEETS_ENDPOINT) {
            await sendStatusUpdate(request.requestId, nextStatus);
        } else {
            saveLocalStatus(request.requestId, nextStatus);
        }

        renderList(await loadRequests());
    }

    function createActionButtons(request) {
        const actionWrap = document.createElement("div");
        actionWrap.className = "action-buttons";

        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "button approve-btn";
        approve.textContent = "Accept";

        const deny = document.createElement("button");
        deny.type = "button";
        deny.className = "button deny-btn";
        deny.textContent = "Deny";

        if (request.status !== "pending") {
            approve.disabled = true;
            deny.disabled = true;
        }

        approve.addEventListener("click", function () {
            updateStatus(request, "approved").catch(function () {
                alert("Could not update request status.");
            });
        });

        deny.addEventListener("click", function () {
            updateStatus(request, "rejected").catch(function () {
                alert("Could not update request status.");
            });
        });

        actionWrap.appendChild(approve);
        actionWrap.appendChild(deny);
        return actionWrap;
    }

    function createRow(request) {
        const row = document.createElement("article");
        row.className = "approval-row";

        const status = sanitizeStatus(request.status);
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

        row.innerHTML = "";

        const cells = [
            request.name || "-",
            request.department || "-",
            request.itemName || "-",
            formatCurrency(request.itemPrice),
            String(request.itemAmount || "-"),
            formatDate(request.requestedAt)
        ];

        cells.forEach(function (value) {
            const span = document.createElement("span");
            span.textContent = value;
            row.appendChild(span);
        });

        const statusCell = document.createElement("span");
        statusCell.innerHTML = '<span class="status-pill status-' + status + '">' + statusLabel + "</span>";
        row.appendChild(statusCell);

        row.appendChild(createActionButtons(Object.assign({}, request, { status: status })));

        return row;
    }

    function renderList(requests) {
        approvalList.innerHTML = "";

        if (!Array.isArray(requests) || requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No requests are waiting for approval.";
            approvalList.appendChild(empty);
            return;
        }

        requests.forEach(function (request) {
            approvalList.appendChild(createRow(request));
        });
    }

    loadRequests()
        .then(renderList)
        .catch(function () {
            renderList([]);
        });
})();
