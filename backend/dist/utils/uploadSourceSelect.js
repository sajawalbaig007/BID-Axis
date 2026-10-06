"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_UPLOAD_SOURCE_SELECT = exports.CSR_UPLOAD_FILE_SELECT = void 0;
/** CSR API — only expose sudo alias, never real source name */
exports.CSR_UPLOAD_FILE_SELECT = {
    companyName: true,
    source: { select: { sudoName: true } },
};
/** Admin API — full source metadata */
exports.ADMIN_UPLOAD_SOURCE_SELECT = {
    id: true,
    name: true,
    sudoName: true,
};
