(function () {
    const requestsList = document.getElementById("requestsList");
    const requestModal = document.getElementById("requestModal");
    const modalDetails = document.getElementById("modalDetails");
    const closeModal = document.getElementById("closeModal");

    if (!requestsList || !requestModal || !modalDetails || !closeModal) {
        return;
    }

    const fallbackRequests = [
        {
            id: "REQ-1007",
            company: "Northlake Components",
            type: "Tax Adjustment",
            date: "2026-02-24",
            status: "pending",
            contact: "finance@northlake.example",
            amount: "$17,450",
            summary: "Requesting state tax correction due to filing mismatch.",
            notes: "Includes supporting spreadsheet and accountant memo."
        },
        {
            id: "REQ-1008",
            company: "Ardent Bio Labs",
            type: "Income Update",
            date: "2026-02-25",
            status: "approved",
            contact: "ops@ardentbio.example",
            amount: "$231,000",
            summary: "Submitted revised annual income documents.",
            notes: "Reviewed by team on February 25, 2026."
        },
        {
            id: "REQ-1010",
            company: "Beacon Freight",
            type: "Expense Dispute",
            date: "2026-02-26",
            status: "rejected",
            contact: "controller@beaconfreight.example",
            amount: "$63,980",
            summary: "Disputing categorized operational expense totals.",
            notes: "Missing evidence for two line items."
        }
    ];

    async function loadRequests() {
        // Replace this with your real backend API call when available.
        // Example: const response = await fetch("/api/requests");
        // return await response.json();
        return fallbackRequests;
    }

    function formatStatus(status) {
        const value = (status || "pending").toLowerCase();
        const label = value.charAt(0).toUpperCase() + value.slice(1);
        return { value, label };
    }

    function createDetailCard(title, value) {
        const card = document.createElement("article");
        card.className = "detail-card";

        const heading = document.createElement("h3");
        heading.textContent = title;

        const content = document.createElement("p");
        content.textContent = value || "-";

        card.appendChild(heading);
        card.appendChild(content);
        return card;
    }

    function openRequestModal(request) {
        modalDetails.innerHTML = "";

        const fields = [
            ["Request ID", request.id],
            ["Company", request.company],
            ["Type", request.type],
            ["Status", request.status],
            ["Date", request.date],
            ["Contact", request.contact],
            ["Amount", request.amount],
            ["Summary", request.summary],
            ["Notes", request.notes]
        ];

        fields.forEach(([label, value]) => {
            modalDetails.appendChild(createDetailCard(label, value));
        });

        requestModal.showModal();
    }

    function createRow(request) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "request-row";

        const status = formatStatus(request.status);

        row.innerHTML = `
            <span class="request-title">${request.company || "Unknown Company"}</span>
            <span>${request.type || "General"}</span>
            <span>${request.date || "-"}</span>
            <span class="status-pill status-${status.value}">${status.label}</span>
        `;

        row.addEventListener("click", function () {
            openRequestModal(request);
        });

        return row;
    }

    function renderRequests(requests) {
        requestsList.innerHTML = "";

        if (!Array.isArray(requests) || requests.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "No requests available yet.";
            requestsList.appendChild(empty);
            return;
        }

        requests.forEach(function (request) {
            requestsList.appendChild(createRow(request));
        });
    }

    closeModal.addEventListener("click", function () {
        requestModal.close();
    });

    requestModal.addEventListener("click", function (event) {
        const bounds = requestModal.getBoundingClientRect();
        const isInDialog =
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;

        if (!isInDialog) {
            requestModal.close();
        }
    });

    loadRequests()
        .then(renderRequests)
        .catch(function () {
            renderRequests([]);
        });
})();
