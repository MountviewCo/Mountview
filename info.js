(function () {
    const signInButton = document.getElementById("googleSignInBtn");
    const createCompanyButton = document.getElementById("createCompanyBtn");
    const companyNameInput = document.getElementById("companyNameInput");
    const companyBudgetInput = document.getElementById("companyBudgetInput");
    const departmentsList = document.getElementById("departmentsList");
    const addDepartmentBtn = document.getElementById("addDepartmentBtn");
    const status = document.getElementById("signInStatus");
    const inviteStatus = document.getElementById("inviteStatus");

    if (
        !signInButton ||
        !createCompanyButton ||
        !companyNameInput ||
        !companyBudgetInput ||
        !departmentsList ||
        !addDepartmentBtn ||
        !status ||
        !inviteStatus
    ) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const endpoint = String(config.googleSheetsEndpoint || "").trim();
    const registrySpreadsheetId = String(config.registrySpreadsheetId || "").trim();
    const params = new URLSearchParams(window.location.search);

    if (params.get("logout") === "1") {
        [
            "mountview_company_id",
            "mountview_company_name",
            "mountview_target_spreadsheet_id",
            "mountview_user_role",
            "mountview_invite_link"
        ].forEach(function (key) {
            localStorage.removeItem(key);
        });
    }

    function setStatus(message, kind) {
        status.className = "form-feedback" + (kind ? " " + kind : "");
        status.textContent = message;
    }

    function setInviteStatus(message) {
        inviteStatus.textContent = message;
    }

    function saveAppSession(data) {
        if (!data) return;
        if (data.companyId) localStorage.setItem("mountview_company_id", data.companyId);
        if (data.companyName) localStorage.setItem("mountview_company_name", data.companyName);
        if (data.companySpreadsheetId) localStorage.setItem("mountview_target_spreadsheet_id", data.companySpreadsheetId);
        if (data.role) localStorage.setItem("mountview_user_role", data.role);
        if (data.inviteLink) localStorage.setItem("mountview_invite_link", data.inviteLink);
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function addDepartmentRow(department, budget) {
        const row = document.createElement("div");
        row.className = "department-row";

        const departmentWrap = document.createElement("div");
        const departmentLabel = document.createElement("label");
        departmentLabel.textContent = "Department";
        const departmentInput = document.createElement("input");
        departmentInput.type = "text";
        departmentInput.className = "department-name";
        departmentInput.value = department || "";
        departmentInput.required = true;

        const budgetWrap = document.createElement("div");
        const budgetLabel = document.createElement("label");
        budgetLabel.textContent = "Budget";
        const budgetInput = document.createElement("input");
        budgetInput.type = "number";
        budgetInput.className = "department-budget";
        budgetInput.min = "0";
        budgetInput.step = "0.01";
        budgetInput.value = budget != null ? String(budget) : "";
        budgetInput.required = true;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "button danger-btn";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", function () {
            row.remove();
            if (departmentsList.children.length === 0) {
                addDepartmentRow("", "");
            }
        });

        departmentWrap.appendChild(departmentLabel);
        departmentWrap.appendChild(departmentInput);
        budgetWrap.appendChild(budgetLabel);
        budgetWrap.appendChild(budgetInput);

        row.appendChild(departmentWrap);
        row.appendChild(budgetWrap);
        row.appendChild(removeButton);
        departmentsList.appendChild(row);
    }

    function collectDepartments() {
        return Array.from(departmentsList.querySelectorAll(".department-row"))
            .map(function (row) {
                return {
                    department: String((row.querySelector(".department-name") || {}).value || "").trim(),
                    budget: toNumber((row.querySelector(".department-budget") || {}).value)
                };
            })
            .filter(function (row) {
                return row.department.length > 0;
            });
    }

    async function getSession() {
        const response = await fetch("/.netlify/functions/google-session");
        if (!response.ok) return { authenticated: false };
        return response.json();
    }

    async function resolveUser(email) {
        const url = new URL(endpoint);
        url.searchParams.set("action", "resolveUser");
        url.searchParams.set("email", email);
        url.searchParams.set("registrySpreadsheetId", registrySpreadsheetId);
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error("Could not resolve user");
        }
        return response.json();
    }

    async function joinByInvite(inviteCode, email) {
        const payload = new URLSearchParams({
            action: "joinCompanyInvite",
            inviteCode: inviteCode,
            email: email,
            registrySpreadsheetId: registrySpreadsheetId
        });
        const response = await fetch(endpoint, { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Invite join failed");
        }
        return response.json();
    }

    async function createCompany(email, companyName, companyBudget, departments) {
        const sheetRes = await fetch("/.netlify/functions/copy-template-later", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ companyName: companyName })
        });
        const sheetData = await sheetRes.json();
        if (!sheetRes.ok || !sheetData.fileId) {
            throw new Error("Could not create or load company spreadsheet");
        }

        const inviteBaseUrl = window.location.origin + "/info.html";
        const payload = new URLSearchParams({
            action: "createCompanyAuth",
            companyName: companyName,
            headEmail: email,
            companySpreadsheetId: sheetData.fileId,
            companyBudget: String(companyBudget),
            departments: JSON.stringify(departments || []),
            inviteBaseUrl: inviteBaseUrl,
            registrySpreadsheetId: registrySpreadsheetId
        });
        const response = await fetch(endpoint, { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Company creation failed");
        }
        return response.json();
    }

    function redirectByRole(role) {
        if (role === "approver") {
            window.location.href = "/accept.html";
            return;
        }
        window.location.href = "/request.html";
    }

    async function resolveSignedInUser() {
        const session = await getSession();
        if (!session.authenticated || !session.email) {
            setStatus("Sign in with Google to continue.");
            return;
        }

        const inviteCode = params.get("invite");
        if (inviteCode) {
            setStatus("Joining company from invite...");
            const joined = await joinByInvite(inviteCode, session.email);
            if (!joined || !joined.ok) {
                throw new Error((joined && joined.error) || "Invite link is invalid");
            }
            saveAppSession(joined);
            setInviteStatus("Joined " + joined.companyName + ". Role: " + joined.role);
            redirectByRole(joined.role);
            return;
        }

        const resolved = await resolveUser(session.email);
        if (resolved && resolved.ok) {
            saveAppSession(resolved);
            setInviteStatus(resolved.inviteLink ? ("Invite link: " + resolved.inviteLink) : "");
            redirectByRole(resolved.role);
            return;
        }

        setStatus("Signed in as " + session.email + ". Create a company or use an invite link.", "success");
    }

    signInButton.addEventListener("click", function () {
        setStatus("Redirecting to Google sign-in...");
        window.location.href = "/.netlify/functions/google-auth-start";
    });

    createCompanyButton.addEventListener("click", async function () {
        const session = await getSession();
        if (!session.authenticated || !session.email) {
            setStatus("Sign in with Google first.", "error");
            return;
        }

        const companyName = String(companyNameInput.value || "").trim();
        if (!companyName) {
            setStatus("Enter a company name first.", "error");
            return;
        }
        const companyBudget = toNumber(companyBudgetInput.value);
        if (companyBudget <= 0) {
            setStatus("Enter a company max budget.", "error");
            return;
        }
        const departments = collectDepartments();
        if (departments.length === 0) {
            setStatus("Add at least one department budget.", "error");
            return;
        }
        const departmentsTotal = departments.reduce(function (sum, row) {
            return sum + (Number(row.budget) || 0);
        }, 0);
        if (departmentsTotal > companyBudget) {
            setStatus("Department budgets exceed company max budget.", "error");
            return;
        }

        createCompanyButton.disabled = true;
        setStatus("Creating company...");
        try {
            const created = await createCompany(session.email, companyName, companyBudget, departments);
            if (!created || !created.ok) {
                throw new Error((created && created.error) || "Company creation failed");
            }
            saveAppSession(created);
            setInviteStatus(created.inviteLink ? ("Invite link: " + created.inviteLink) : "");
            setStatus("Company created. Redirecting...", "success");
            redirectByRole(created.role || "approver");
        } catch (error) {
            setStatus("Create company failed: " + error.message, "error");
        } finally {
            createCompanyButton.disabled = false;
        }
    });

    resolveSignedInUser().catch(function (error) {
        setStatus("Sign-in setup failed: " + error.message, "error");
    });

    addDepartmentBtn.addEventListener("click", function () {
        addDepartmentRow("", "");
    });

    addDepartmentRow("", "");
})();
