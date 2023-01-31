import { Request as ExpressRequest } from 'express';
import { getSession as getSqliteSessionData } from './sqlite'

export function getSession(req: ExpressRequest) {
    if (req.params.session) {
        const sessionId = req.params.session;
        const session = getSqliteSessionData(sessionId);
        if (session === null) {
            throw new Error("Session does not exist")
        }
        return session
    }

    throw new Error("Missing session Id")
}