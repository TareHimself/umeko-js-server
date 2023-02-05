export function buildResponse<T = any>(data: T, error = false) {
    return {
        data, error
    }
}

export function log(...data) {
    console.log.apply(null, data);
}

export interface ICardUpdate {
    color: string;
    opacity: number;
    background: string;
}

export function getTimeAsInt(): number {
    return 0
}