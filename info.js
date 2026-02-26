(function () {
    const form = document.getElementById("companyInfoForm");
    const submitButton = document.getElementById("submitCompanyBtn");
    const statusMessage = document.getElementById("companyInfoStatus");
    const companyMode = document.getElementById("companyMode");
    const companyIdInput = document.getElementById("companyId");
    const companyEmailInput = document.getElementById("companyEmail");
    const loadCompanyBtn = document.getElementById("loadCompanyBtn");
    const newCompanyBtn = document.getElementById("newCompanyBtn");
    const departmentsList = document.getElementById("departmentsList");
    const addDepartmentBtn = document.getElementById("addDepartmentBtn");

    if (
        !form ||
        !submitButton ||
        !statusMessage ||
        !companyMode ||
        !companyIdInput ||
        !companyEmailInput ||
        !loadCompanyBtn ||
        !newCompanyBtn ||
        !departmentsList ||
        !addDepartmentBtn
    ) {
        return;
    }

    const config = window.MOUNTVIEW_CONFIG || {};
    const GOOGLE_SHEETS_ENDPOINT = String(config.googleSheetsEndpoint || "").trim();
    const TARGET_SPREADSHEET_ID = String(localStorage.getItem("mountview_target_spreadsheet_id") || "").trim();

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function setMode(editing) {
        companyMode.textContent = editing ? "Mode: Edit Existing Company" : "Mode: Create New Company";
    }

    function createDepartmentRow(department, budget) {
        const row = document.createElement("div");
        row.className = "department-row";

        const nameWrap = document.createElement("div");
        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Department";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "department-name";
        nameInput.value = department || "";
        nameInput.required = true;

        const budgetWrap = document.createElement("div");
        const budgetLabel = document.createElement("label");
        budgetLabel.textContent = "Budget";
        const budgetInput = document.createElement("input");
        budgetInput.type = "number";
        budgetInput.min = "0";
        budgetInput.step = "0.01";
        budgetInput.className = "department-budget";
        budgetInput.value = budget != null ? String(budget) : "";
        budgetInput.required = true;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "button danger-btn";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", function () {
            row.remove();
            ensureDepartmentRows();
        });

        nameWrap.appendChild(nameLabel);
        nameWrap.appendChild(nameInput);
        budgetWrap.appendChild(budgetLabel);
        budgetWrap.appendChild(budgetInput);

        row.appendChild(nameWrap);
        row.appendChild(budgetWrap);
        row.appendChild(removeButton);

        departmentsList.appendChild(row);
    }

    function ensureDepartmentRows() {
        if (departmentsList.children.length === 0) {
            createDepartmentRow("", "");
        }
    }

    function clearDepartmentRows() {
        departmentsList.innerHTML = "";
        ensureDepartmentRows();
    }

    function collectDepartments() {
        const rows = Array.from(departmentsList.querySelectorAll(".department-row"));
        const departments = rows
            .map(function (row) {
                return {
                    department: String((row.querySelector(".department-name") || {}).value || "").trim(),
                    budget: toNumber((row.querySelector(".department-budget") || {}).value)
                };
            })
            .filter(function (row) {
                return row.department.length > 0;
            });

        return departments;
    }

    function normalizeCompany(formData) {
        return {
            companyId: String(formData.get("companyId") || "").trim() || "COMP-" + Date.now(),
            companyName: String(formData.get("companyName") || "").trim(),
            companyAddress: String(formData.get("companyAddress") || "").trim(),
            stateTax: String(formData.get("stateTax") || "").trim(),
            annualIncome: toNumber(formData.get("annualIncome")),
            annualExpense: toNumber(formData.get("annualExpense")),
            companyBudget: toNumber(formData.get("companyBudget")),
            companyEmail: String(formData.get("companyEmail") || "").trim(),
            departments: collectDepartments(),
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
            companyBudget: String(companyInfo.companyBudget),
            companyEmail: companyInfo.companyEmail,
            departments: JSON.stringify(companyInfo.departments),
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

        const result = await response.json();
        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? result.error : "Apps Script rejected company info");
        }
    }

    function fillCompanyForm(company) {
        companyIdInput.value = String(company.companyId || "");
        document.getElementById("companyName").value = String(company.companyName || "");
        document.getElementById("companyAddress").value = String(company.companyAddress || "");
        document.getElementById("stateTax").value = String(company.stateTax || "");
        document.getElementById("annualIncome").value = String(company.annualIncome || 0);
        document.getElementById("annualExpense").value = String(company.annualExpense || 0);
        document.getElementById("companyBudget").value = String(company.companyBudget || 0);
        companyEmailInput.value = String(company.companyEmail || "");

        departmentsList.innerHTML = "";
        const departments = Array.isArray(company.departments) ? company.departments : [];
        if (departments.length === 0) {
            createDepartmentRow("", "");
        } else {
            departments.forEach(function (row) {
                createDepartmentRow(row.department, row.budget);
            });
        }

        setMode(true);
    }

    async function loadCompanyRemoteByEmail(email) {
        const url = new URL(GOOGLE_SHEETS_ENDPOINT);
        buildTargetParams(url.searchParams);
        url.searchParams.set("action", "getCompany");
        url.searchParams.set("companyEmail", email);

        const response = await fetch(url.toString(), { method: "GET" });
        if (!response.ok) {
            throw new Error("Failed to load company");
        }

        const data = await response.json();
        if (!data || !data.ok || !data.company) {
            return null;
        }

        return data.company;
    }

    function loadCompanyLocalByEmail(email) {
        const rows = JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
        const match = rows.find(function (row) {
            return String(row.companyEmail || "").toLowerCase() === email.toLowerCase();
        });
        return match || null;
    }

    async function onLoadCompany() {
        const email = String(companyEmailInput.value || "").trim();
        if (!email) {
            statusMessage.className = "form-feedback error";
            statusMessage.textContent = "Enter company email first.";
            companyEmailInput.focus();
            return;
        }

        loadCompanyBtn.disabled = true;
        statusMessage.className = "form-feedback";
        statusMessage.textContent = "Loading company info...";

        try {
            const company = GOOGLE_SHEETS_ENDPOINT
                ? await loadCompanyRemoteByEmail(email)
                : loadCompanyLocalByEmail(email);

            if (!company) {
                statusMessage.className = "form-feedback error";
                statusMessage.textContent = "No company found for that email.";
                return;
            }

            fillCompanyForm(company);
            statusMessage.className = "form-feedback success";
            statusMessage.textContent = "Company info loaded. You can now edit and save.";
        } catch (error) {
            statusMessage.className = "form-feedback error";
            statusMessage.textContent = "Could not load company info.";
        } finally {
            loadCompanyBtn.disabled = false;
        }
    }

    function onStartNew() {
        form.reset();
        companyIdInput.value = "";
        clearDepartmentRows();
        setMode(false);
        statusMessage.className = "form-feedback";
        statusMessage.textContent = "";
    }

    async function onSubmit(event) {
        event.preventDefault();

        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const departments = collectDepartments();
        if (departments.length === 0) {
            statusMessage.className = "form-feedback error";
            statusMessage.textContent = "Add at least one department and budget.";
            return;
        }

        const companyInfo = normalizeCompany(new FormData(form));
        if (companyInfo.companyName) {
            localStorage.setItem("mountview_company_name", companyInfo.companyName);
        }

        submitButton.disabled = true;
        statusMessage.className = "form-feedback";
        statusMessage.textContent = "Saving company info...";

        try {
            await sendToGoogleSheets(companyInfo);

            companyIdInput.value = companyInfo.companyId;
            setMode(true);
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

    addDepartmentBtn.addEventListener("click", function () {
        createDepartmentRow("", "");
    });
    loadCompanyBtn.addEventListener("click", onLoadCompany);
    newCompanyBtn.addEventListener("click", onStartNew);
    form.addEventListener("submit", onSubmit);

    ensureDepartmentRows();
    setMode(false);
})();
