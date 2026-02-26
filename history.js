(function () {
    const list = document.getElementById("historyList");
    const summary = document.getElementById("historySummary");
    const userMeta = document.getElementById("historyUserMeta");
    const currentBudgetEl = document.getElementById("historyCurrentBudget");
    const maxBudgetEl = document.getElementById("historyMaxBudget");
    const graph = document.getElementById("historyBudgetGraph");
    const backBtn = document.getElementById("historyBackBtn");
    const signOutBtn = document.getElementById("historySignOutBtn");

    if (!list || !summary) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const endpoint = String(config.googleSheetsEndpoint || "").trim();
    const spreadsheetId = String(localStorage.getItem("mountview_target_spreadsheet_id") || config.spreadsheetId || "").trim();
    const companyId = String(localStorage.getItem("mountview_company_id") || "").trim();

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

    async function fetchCompanyBudget() {
        if (!companyId) {
            return 0;
        }
        const url = new URL(endpoint);
        url.searchParams.set("action", "getCompany");
        url.searchParams.set("companyId", companyId);
        url.searchParams.set("spreadsheetId", spreadsheetId);
        const response = await fetch(url.toString());
        if (!response.ok) {
            return 0;
        }
        const data = await response.json();
        if (!data || !data.ok || !data.company) {
            return 0;
        }
        return Number(data.company.companyBudget) || 0;
    }

    function toAmount(request) {
        return (Number(request.itemPrice) || 0) * (Number(request.itemAmount) || 0);
    }

    function toDecisionTime(request) {
        const raw = request.updatedAt || request.decisionAt || request.createdAt || "";
        const time = new Date(raw).getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function buildBudgetSeries(requests, maxBudget) {
        const approved = requests
            .filter(function (request) {
                return normalizeStatus(request.status) === "approved";
            })
            .slice()
            .sort(function (a, b) {
                return toDecisionTime(a) - toDecisionTime(b);
            });

        let spent = 0;
        const points = [];
        const startTime = approved.length ? toDecisionTime(approved[0]) : Date.now();
        points.push({ x: startTime, y: maxBudget });

        approved.forEach(function (request) {
            spent += toAmount(request);
            points.push({ x: toDecisionTime(request), y: maxBudget - spent });
        });

        if (points.length === 1) {
            points.push({ x: Date.now(), y: maxBudget });
        }

        return {
            points: points,
            spent: spent,
            current: maxBudget - spent
        };
    }

    function polyline(points) {
        return points.map(function (p) {
            return p.x + "," + p.y;
        }).join(" ");
    }

    function renderBudgetGraph(series, maxBudget) {
        if (!graph) {
            return;
        }
        const width = 900;
        const height = 280;
        const pad = { l: 50, r: 20, t: 20, b: 40 };
        const minX = series.points[0].x;
        const maxX = series.points[series.points.length - 1].x || minX + 1;
        const xSpan = Math.max(1, maxX - minX);
        const minY = Math.min(0, series.current, maxBudget);
        const maxY = Math.max(maxBudget, 1);
        const ySpan = Math.max(1, maxY - minY);

        function sx(x) {
            return pad.l + ((x - minX) / xSpan) * (width - pad.l - pad.r);
        }
        function sy(y) {
            return pad.t + ((maxY - y) / ySpan) * (height - pad.t - pad.b);
        }

        const remainingPoints = series.points.map(function (p) {
            return { x: sx(p.x), y: sy(p.y) };
        });
        const maxLine = [
            { x: pad.l, y: sy(maxBudget) },
            { x: width - pad.r, y: sy(maxBudget) }
        ];

        graph.innerHTML = ""
            + '<line x1="' + maxLine[0].x + '" y1="' + maxLine[0].y + '" x2="' + maxLine[1].x + '" y2="' + maxLine[1].y + '" class="graph-max-line"></line>'
            + '<polyline points="' + polyline(remainingPoints) + '" class="graph-remaining-line"></polyline>'
            + '<text x="' + (pad.l + 4) + '" y="' + (maxLine[0].y - 6) + '" class="graph-label">Max Budget</text>'
            + '<text x="' + (pad.l + 4) + '" y="' + (sy(series.current) - 6) + '" class="graph-label">Current Budget</text>';
    }

    function render(requests, maxBudget) {
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
        const series = buildBudgetSeries(requests, maxBudget);

        summary.textContent =
            "Approved: " + approved.length + " (" + formatCurrency(approvedTotal) + ")" +
            " | Denied: " + denied.length + " (" + formatCurrency(deniedTotal) + ")";
        if (currentBudgetEl) {
            currentBudgetEl.textContent = formatCurrency(series.current);
        }
        if (maxBudgetEl) {
            maxBudgetEl.textContent = formatCurrency(maxBudget);
        }
        renderBudgetGraph(series, maxBudget);

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
            return Promise.all([fetchRequests(), fetchCompanyBudget()]).then(function (res) {
                render(res[0], res[1]);
            });
        })
        .catch(function (error) {
            list.innerHTML = "";
            const err = document.createElement("p");
            err.className = "empty-state";
            err.textContent = "Could not load history: " + error.message;
            list.appendChild(err);
        });
})();
