"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countLeadStatuses = countLeadStatuses;
function countLeadStatuses(leads) {
    const stats = {
        total: leads.length,
        pending: 0,
        important: 0,
        interested: 0,
        notPicked: 0,
        projectWon: 0,
        notInterested: 0,
    };
    for (const l of leads) {
        const s = (l.status ?? "").toLowerCase();
        if (s === "pending")
            stats.pending++;
        else if (s === "important")
            stats.important++;
        else if (s === "interested")
            stats.interested++;
        else if (s === "close client")
            stats.projectWon++;
        else if (s === "not picked" || s === "not completed")
            stats.notPicked++;
        else if (s === "not interested" || s === "completed")
            stats.notInterested++;
    }
    return stats;
}
