(function () {
    const list = document.getElementById("historyList");
    const summary = document.getElementById("historySummary");
    const userMeta = document.getElementById("historyUserMeta");
    const backBtn = document.getElementById("historyBackBtn");
    const signOutBtn = document.getElementById("historySignOutBtn");

    if (!list || !summary) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const endpoint = String(config.googleSheetsEndpoint || "").trim();
    const spreadsheetId = String(localStorage.getItem("mountview_target_spreadsheet_id") || config.spreadsheetId || "").trim();

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
    }

    function formatDate(value) {
        const date = new Date(value || "");
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleString("en-US");
    }

    function normalizeStatus(status) {
        const value = String(status || "").toLowerCase();
        if (value === "approved" || value === "rejected" || value === "pending") return value;
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
        return true;
    }

    async function fetchRequests() {
        if (!endpoint) throw new Error("Missing googleSheetsEndpoint in config.js");
        if (!spreadsheetId) throw new Error("Missing spreadsheetId. Set it in config.js or connect first.");

        const url = new URL(endpoint);
        url.searchParams.set("action", "list");
        url.searchParams.set("spreadsheetId", spreadsheetId);
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("Failed to load history");
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    function render(requests) {
        const approved = [];
        const denied = [];
        requests.forEach(function (request) {
            const status = normalizeStatus(request.status);
            if (status === "approved") approved.push(request);
            if (status === "rejected") denied.push(request);
        });

        const approvedTotal = approved.reduce(function (sum, request) {
            return sum + (Number(request.itemPrice) || 0) * (Number(request.itemAmount) || 0);
        }, 0);
        const deniedTotal = denied.reduce(function (sum, request) {
            return sum + (Number(request.itemPrice) || 0) * (Number(request.itemAmount) || 0);
        }, 0);

        summary.textContent =
            "Approved: " + approved.length + " (" + formatCurrency(approvedTotal) + ")" +
            " | Denied: " + denied.length + " (" + formatCurrency(deniedTotal) + ")";

        list.innerHTML = "";
        if (requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No request history yet.";
            list.appendChild(empty);
            return;
        }

        const decided = requests
            .filter(function (request) {
                const status = normalizeStatus(request.status);
                return status === "approved" || status === "rejected";
            })
            .sort(function (a, b) {
                return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
            });

        if (decided.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No approvals or denials yet.";
            list.appendChild(empty);
            return;
        }

        decided.forEach(function (request) {
            const total = (Number(request.itemPrice) || 0) * (Number(request.itemAmount) || 0);
            const status = normalizeStatus(request.status);
            const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

            const row = document.createElement("article");
            row.className = "approval-row";
            row.innerHTML = [
                request.requestId || "-",
                request.department || "-",
                request.itemName || "-",
                formatCurrency(total),
                '<span class="status-pill status-' + status + '">' + statusLabel + "</span>",
                formatDate(request.updatedAt || request.decisionAt || request.createdAt)
            ].map(function (cell) {
                return "<span>" + cell + "</span>";
            }).join("");
            list.appendChild(row);
        });
    }

    if (backBtn) {
        backBtn.addEventListener("click", function () {
            window.location.href = "/accept.html";
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener("click", function () {
            window.location.href = "/.netlify/functions/google-logout";
        });
    }

    enforceRole()
        .then(function (ok) {
            if (!ok) return;
            return fetchRequests().then(render);
        })
        .catch(function (error) {
            list.innerHTML = "";
            const err = document.createElement("p");
            err.className = "empty-state";
            err.textContent = "Could not load history: " + error.message;
            list.appendChild(err);
        });
})();
