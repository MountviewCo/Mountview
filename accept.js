(function () {
    const approvalList = document.getElementById("approvalList");
    const userMeta = document.getElementById("acceptUserMeta");
    const inviteMeta = document.getElementById("acceptInviteMeta");
    const signOutButton = document.getElementById("acceptSignOutBtn");
    const historyButton = document.getElementById("historyBtn");
    const copyInviteButton = document.getElementById("copyInviteBtn");

    if (!approvalList) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(localStorage.getItem("mountview_target_spreadsheet_id") || config.spreadsheetId || "").trim();

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(number);
    }

    function formatDate(dateValue) {
        const date = new Date(dateValue || "");
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
        if (role !== "approver") {
            window.location.href = "/request.html";
            return false;
        }

        if (userMeta) {
            userMeta.textContent = "Signed in: " + (session.email || "approver");
        }
        if (inviteMeta) {
            const inviteLink = String(localStorage.getItem("mountview_invite_link") || "");
            inviteMeta.textContent = inviteLink ? ("Invite link: " + inviteLink) : "Invite link unavailable";
        }
        return true;
    }

    async function fetchRequests() {
        if (!GOOGLE_SHEETS_ENDPOINT) {
            throw new Error("Missing googleSheetsEndpoint in config.js");
        }
        if (!TARGET_SPREADSHEET_ID) {
            throw new Error("Missing spreadsheetId. Set it in config.js or connect first.");
        }

        const url = new URL(GOOGLE_SHEETS_ENDPOINT);
        url.searchParams.set("action", "list");
        url.searchParams.set("spreadsheetId", TARGET_SPREADSHEET_ID);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error("Failed to fetch requests");
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async function updateRequestStatus(requestId, nextStatus) {
        const payload = new URLSearchParams({
            action: "updateStatus",
            requestId: requestId,
            status: nextStatus,
            spreadsheetId: TARGET_SPREADSHEET_ID
        });

        const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
            method: "POST",
            body: payload
        });

        if (!response.ok) {
            throw new Error("Status update failed");
        }

        const result = await response.json();
        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error : "Apps Script rejected status update");
        }
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

        if (normalizeStatus(request.status) !== "pending") {
            approve.disabled = true;
            deny.disabled = true;
        }

        approve.addEventListener("click", function () {
            updateRequestStatus(request.requestId, "approved")
                .then(loadAndRender)
                .catch(function () {
                    alert("Could not approve request.");
                });
        });

        deny.addEventListener("click", function () {
            updateRequestStatus(request.requestId, "rejected")
                .then(loadAndRender)
                .catch(function () {
                    alert("Could not reject request.");
                });
        });

        actionWrap.appendChild(approve);
        actionWrap.appendChild(deny);
        return actionWrap;
    }

    function createRow(request) {
        const row = document.createElement("article");
        row.className = "approval-row";

        const total = (Number(request.itemPrice) || 0) * (Number(request.itemAmount) || 0);
        const status = normalizeStatus(request.status);
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

        const cells = [
            request.name || "-",
            request.department || "-",
            request.itemName || "-",
            formatCurrency(total),
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

        row.appendChild(createActionButtons(request));
        return row;
    }

    function renderRequests(requests) {
        approvalList.innerHTML = "";

        if (!Array.isArray(requests) || requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No requests found for this sheet.";
            approvalList.appendChild(empty);
            return;
        }

        const sorted = requests.slice().sort(function (a, b) {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });

        sorted.forEach(function (request) {
            approvalList.appendChild(createRow(request));
        });
    }

    async function loadAndRender() {
        const requests = await fetchRequests();
        renderRequests(requests);
    }

    if (historyButton) {
        historyButton.addEventListener("click", function () {
            window.location.href = "/history.html";
        });
    }

    if (copyInviteButton) {
        copyInviteButton.addEventListener("click", function () {
            const inviteLink = String(localStorage.getItem("mountview_invite_link") || "");
            if (!inviteLink) {
                alert("No invite link available yet.");
                return;
            }
            navigator.clipboard.writeText(inviteLink).then(function () {
                alert("Invite link copied.");
            }).catch(function () {
                alert("Could not copy invite link.");
            });
        });
    }

    if (signOutButton) {
        signOutButton.addEventListener("click", function () {
            window.location.href = "/.netlify/functions/google-logout";
        });
    }

    enforceRole()
        .then(function (ok) {
            if (!ok) return;
            return loadAndRender();
        })
        .catch(function () {
            approvalList.innerHTML = "";
            const err = document.createElement("p");
            err.className = "empty-state";
            err.textContent = "Could not load requests.";
            approvalList.appendChild(err);
        });
})();
