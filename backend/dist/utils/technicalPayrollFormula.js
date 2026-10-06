"use strict";
/** Technical Team payroll formulas — OT, late (7–4), leaves, loan, PF 8%, tax, occasional */
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyTechnicalSalary = emptyTechnicalSalary;
exports.timeToMinutes = timeToMinutes;
exports.calcLateDeduction = calcLateDeduction;
exports.computeTechnicalSalary = computeTechnicalSalary;
function emptyTechnicalSalary(partial) {
    const merged = {
        basic: 0,
        allowance: 0,
        weekdayOtHours: 0,
        weekendOtHours: 0,
        checkIn: "07:00",
        checkOut: "16:00",
        lateDeductionOverride: null,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        loanTotal: 0,
        loanPaid: 0,
        loanThisMonth: 0,
        incomeTax: 0,
        occasionalAmount: 0,
        occasionalRemark: "",
        pfAuto: true,
        pfOverride: null,
        remarks: "",
        employeeId: "",
        address: "",
        phone: "",
        cnic: "",
        ...partial,
    };
    merged.occasionalAmount = Math.max(0, Number(merged.occasionalAmount) || 0);
    merged.occasionalRemark = String(merged.occasionalRemark ?? "");
    merged.pfAuto = partial?.pfAuto !== false;
    return merged;
}
function timeToMinutes(t) {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t.trim()))
        return null;
    const [h, m] = t.trim().split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59)
        return null;
    return h * 60 + m;
}
/**
 * Late deduction — shift 07:00–16:00 (9h). Relief ≤07:30.
 * 07:30–08:00 → ¼ day | 08:00–09:00 → ⅓ day | 09:00+ → half day
 * Waiver if late but worked ≥ 9 hours.
 */
function calcLateDeduction(daySalary, checkIn, checkOut, override) {
    if (override != null && Number.isFinite(override) && override >= 0) {
        return { amount: Number(override) || 0, rule: "Manual late override" };
    }
    const inMin = timeToMinutes(checkIn);
    const outMin = timeToMinutes(checkOut);
    if (inMin == null)
        return { amount: 0, rule: "No check-in — no late cut" };
    const reliefEnd = 7 * 60 + 30;
    const eight = 8 * 60;
    const nine = 9 * 60;
    if (inMin <= reliefEnd) {
        return { amount: 0, rule: "On time / relief (≤ 07:30)" };
    }
    if (outMin != null) {
        const worked = outMin >= inMin ? outMin - inMin : outMin + 24 * 60 - inMin;
        if (worked >= 9 * 60) {
            return { amount: 0, rule: "Late but completed ≥ 9h shift — waived" };
        }
    }
    if (inMin < eight)
        return { amount: daySalary / 4, rule: "07:30–08:00 → ¼ day" };
    if (inMin < nine)
        return { amount: daySalary / 3, rule: "08:00–09:00 → ⅓ day" };
    return { amount: daySalary / 2, rule: "09:00+ → half day" };
}
function computeTechnicalSalary(detail) {
    const basic = Number(detail.basic) || 0;
    const allowance = Number(detail.allowance) || 0;
    const monthlySalary = basic + allowance;
    const daySalary = basic / 30;
    const hourSalary = monthlySalary / 30 / 8;
    const weekdayOtHours = Number(detail.weekdayOtHours) || 0;
    const weekendOtHours = Number(detail.weekendOtHours) || 0;
    const weekdayOtPay = weekdayOtHours * hourSalary * 1.5;
    const weekendOtPay = weekendOtHours * hourSalary * 2;
    const totalOvertime = weekdayOtPay + weekendOtPay;
    const totalEarning = basic + totalOvertime + allowance;
    const late = calcLateDeduction(daySalary, detail.checkIn, detail.checkOut, detail.lateDeductionOverride);
    const unpaidLeaveDays = Number(detail.unpaidLeaveDays) || 0;
    const unpaidLeaveDeduction = unpaidLeaveDays * daySalary;
    const paidLeaveDays = Number(detail.paidLeaveDays) || 0;
    const loanTotal = Number(detail.loanTotal) || 0;
    const loanPaid = Number(detail.loanPaid) || 0;
    const loanThisMonth = Number(detail.loanThisMonth) || 0;
    const loanRemaining = Math.max(0, loanTotal - loanPaid - loanThisMonth);
    const pf = detail.pfAuto !== false
        ? basic * 0.08
        : Number(detail.pfOverride) || 0;
    const incomeTax = Number(detail.incomeTax) || 0;
    const totalDeduction = late.amount + unpaidLeaveDeduction + loanThisMonth + pf + incomeTax;
    const occasionalAmount = Math.max(0, Number(detail.occasionalAmount) || 0);
    const totalSalary = totalEarning - totalDeduction + occasionalAmount;
    return {
        monthlySalary,
        daySalary,
        hourSalary,
        weekdayOtPay,
        weekendOtPay,
        totalOvertime,
        totalEarning,
        lateDeduction: late.amount,
        unpaidLeaveDeduction,
        paidLeaveDays,
        unpaidLeaveDays,
        loanThisMonth,
        loanRemaining,
        pf,
        incomeTax,
        occasionalAmount,
        totalDeduction,
        totalSalary,
        lateRuleApplied: late.rule,
    };
}
