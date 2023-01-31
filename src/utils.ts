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
    fileAsBase64: string;
}

export function getTimeAsInt(): number {
    return 0
}