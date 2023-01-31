"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = void 0;
const sqlite_1 = require("./sqlite");
function getSession(req) {
    if (req.params.session) {
        const sessionId = req.params.session;
        const session = (0, sqlite_1.getSession)(sessionId);
        if (session === null) {
            throw new Error("Session does not exist");
        }
        return session;
    }
    throw new Error("Missing session Id");
}
exports.getSession = getSession;
