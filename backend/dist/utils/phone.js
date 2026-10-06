"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.phonesMatch = phonesMatch;
function normalizePhone(phone) {
    return phone.replace(/\D/g, "");
}
function phonesMatch(a, b) {
    const na = normalizePhone(a);
    const nb = normalizePhone(b);
    if (na.length < 7 || nb.length < 7)
        return false;
    if (na === nb)
        return true;
    if (na.length >= 10 && nb.length >= 10)
        return na.slice(-10) === nb.slice(-10);
    return false;
}
