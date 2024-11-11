export function buildResponse<T = any>(data: T, error = false) {
	return {
		data,
		error,
	};
}

export function log(...data) {
	console.log.apply(null, data);
}

export function getTimeAsInt(): number {
	return 0;
}

export function isAdmin(permissions: number) {
	if (typeof permissions !== 'number') return false;
	return eval(`(${permissions}n & (1n << 3n)) === (1n << 3n)`);
}

export function makeUpdateStatement<K, T extends Record<string, K>>(
	update: T,
	ignore: (keyof T)[],
	startNumber = 1
): [string, K[]] {
	let currentItem = startNumber;
	let currentParams: K[] = [];

	return [
		Object.keys(update)
			.reduce((total, key) => {
				if (!ignore.includes(key)) {
					total += ` ${key} = $${currentItem} ,`;
					currentItem++;
					currentParams.push(update[key]);
				}

				return total;
			}, 'SET')
			.slice(0, -1)
			.trim(),
		currentParams,
	];
}
