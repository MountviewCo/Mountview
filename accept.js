(function () {
    const approvalList = document.getElementById("approvalList");
    const budgetSummary = document.getElementById("budgetSummary");
    const budgetGraph = document.getElementById("budgetGraph");
    const departmentForm = document.getElementById("departmentForm");
    const departmentStatus = document.getElementById("departmentStatus");
    const saveDepartmentBtn = document.getElementById("saveDepartmentBtn");
    const requestModal = document.getElementById("requestModal");
    const modalDetails = document.getElementById("modalDetails");
    const closeModal = document.getElementById("closeModal");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const loadingText = document.getElementById("loadingText");

    if (
        !approvalList ||
        !budgetSummary ||
        !budgetGraph ||
        !departmentForm ||
        !departmentStatus ||
        !saveDepartmentBtn ||
        !requestModal ||
        !modalDetails ||
        !closeModal ||
        !loadingOverlay ||
        !loadingText
    ) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(config.spreadsheetId || "").trim();
    const TARGET_SPREADSHEET_NAME = String(config.spreadsheetName || "").trim();
    const LOCAL_STORE_KEY = "mountview_requests";

    function showLoading(message) {
        loadingText.textContent = message || "Loading data...";
        loadingOverlay.classList.add("visible");
        loadingOverlay.setAttribute("aria-hidden", "false");
    }

    function hideLoading() {
        loadingOverlay.classList.remove("visible");
        loadingOverlay.setAttribute("aria-hidden", "true");
    }

    function withTargetParams(urlOrParams) {
        if (urlOrParams instanceof URLSearchParams) {
            if (TARGET_SPREADSHEET_ID) {
                urlOrParams.set("spreadsheetId", TARGET_SPREADSHEET_ID);
            }
            if (TARGET_SPREADSHEET_NAME) {
                urlOrParams.set("spreadsheetName", TARGET_SPREADSHEET_NAME);
            }
            return urlOrParams;
        }

        const url = new URL(GOOGLE_SHEETS_ENDPOINT);
        url.searchParams.set("action", urlOrParams);
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

    function formatDate(value) {
        if (!value) {
            return "-";
        }
        const date = new Date(value);
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

    function normalizeStatus(status) {
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
            throw new Error("Fetch failed");
        }
        return response.json();
    }

    async function loadRemoteRequests() {
        const data = await fetchJson("list");
        return Array.isArray(data) ? data : [];
    }

    async function loadRemoteDepartments() {
        const data = await fetchJson("listDepartments");
        return Array.isArray(data) ? data : [];
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
        if (!TARGET_SPREADSHEET_ID) {
            throw new Error("Missing target spreadsheet ID.");
        }

        const payload = new URLSearchParams({
            action: "updateStatus",
            requestId: requestId,
            status: nextStatus
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
            throw new Error("Department save failed");
        }

        const result = await response.json();
        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error : "Apps Script rejected status update");
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

    function createActionButtons(request, context) {
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

        if (normalizeStatus(request.status) !== "pending") {
            approve.disabled = true;
            deny.disabled = true;
        }

        if (context.isOver) {
            approve.title = "This request exceeds the department remaining budget.";
            approve.classList.add("warning-outline");
        }

        approve.addEventListener("click", function (event) {
            event.stopPropagation();
            setRequestStatus(request, "approved").catch(function () {
                alert("Could not update request status.");
            });
        });

        deny.addEventListener("click", function (event) {
            event.stopPropagation();
            setRequestStatus(request, "rejected").catch(function () {
                alert("Could not update request status.");
            });
        });

        actionWrap.appendChild(approve);
        actionWrap.appendChild(deny);
        return actionWrap;
    }

    function createRow(request, budgetStats) {
        const row = document.createElement("article");
        row.className = "approval-row approval-row-button";
        row.tabIndex = 0;

        const status = normalizeStatus(request.status);
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        const context = buildRequestBudgetContext(request, budgetStats);

        const cells = [
            request.name || "-",
            context.department,
            request.itemName || "-",
            formatCurrency(context.total),
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

        const flagCell = document.createElement("span");
        flagCell.className = context.isOver ? "budget-flag danger-text" : "budget-flag success-text";
        if (!context.hasBudget) {
            flagCell.textContent = "No Budget";
            flagCell.className = "budget-flag muted-text";
        } else if (context.isOver) {
            flagCell.textContent = "Over by " + formatCurrency(context.overBy);
        } else {
            flagCell.textContent = "Within Budget";
        }
        row.appendChild(flagCell);

        row.appendChild(createActionButtons(Object.assign({}, request, { status: status }), context));

        row.addEventListener("click", function () {
            openModal(request, context);
        });
        row.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openModal(request, context);
            }
        });

        return row;
    }

    function renderRequests(stats) {
        approvalList.innerHTML = "";

        if (!Array.isArray(state.requests) || state.requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No requests are waiting for approval.";
            approvalList.appendChild(empty);
            return;
        }

        const sorted = state.requests.slice().sort(function (a, b) {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        sorted.forEach(function (request) {
            approvalList.appendChild(createRow(request, stats));
        });
    }

    loadRequests()
        .then(renderList)
        .catch(function () {
            renderList([]);
        });
})();
