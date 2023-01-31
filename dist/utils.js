"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimeAsInt = exports.log = exports.buildResponse = void 0;
function buildResponse(data, error = false) {
    return {
        data, error
    };
}
exports.buildResponse = buildResponse;
function log(...data) {
    console.log.apply(null, data);
}
exports.log = log;
function getTimeAsInt() {
    return 0;
}
exports.getTimeAsInt = getTimeAsInt;
