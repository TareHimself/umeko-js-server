export function buildResponse<T = any>(data: T, error = false) {
    return {
        data, error
    }
}

export function log(...data) {
    console.log.apply(null, data);
}

export function getTimeAsInt(): number {
    return 0
}

export function isAdmin(permissions: number) {
    if (typeof permissions !== 'number') return false;
    return eval(`(${permissions}n & (1n << 3n)) === (1n << 3n)`)
}