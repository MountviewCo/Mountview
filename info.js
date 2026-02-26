(function () {
    const signInButton = document.getElementById("googleSignInBtn");
    const createCompanyButton = document.getElementById("createCompanyBtn");
    const companyNameInput = document.getElementById("companyNameInput");
    const status = document.getElementById("signInStatus");
    const inviteStatus = document.getElementById("inviteStatus");

    if (!signInButton || !createCompanyButton || !companyNameInput || !status || !inviteStatus) {
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

    async function createCompany(email, companyName) {
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

        createCompanyButton.disabled = true;
        setStatus("Creating company...");
        try {
            const created = await createCompany(session.email, companyName);
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
})();
