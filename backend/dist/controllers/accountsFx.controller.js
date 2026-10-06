"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiveFxRates = getLiveFxRates;
const fxRates_1 = require("../utils/fxRates");
/** GET /api/accounts/fx-rates — live USD→PKR & CAD→PKR (Google Finance first). */
async function getLiveFxRates(_req, res) {
    try {
        const rates = await (0, fxRates_1.fetchLiveFxRates)();
        return res.json({ success: true, ...rates });
    }
    catch (err) {
        console.log(err);
        return res.status(502).json({
            success: false,
            message: "Could not fetch live FX rates. Please try again in a moment.",
        });
    }
}
