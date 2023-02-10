import { Request as ExpressRequest } from 'express';
import { tGetSession as getSqliteSessionData, tGetSession } from './sqlite'

export function getSession(req: ExpressRequest) {
    if (req.params.session) {
        const sessionId = req.params.session;
        const session = tGetSession(sessionId);
        if (session === null) {
            throw new Error("Session does not exist")
        }
        return session
    }

    throw new Error("Missing session Id")
}