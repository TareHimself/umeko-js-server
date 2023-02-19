try {
    process.env = { ...process.env, ...require("../secretes.json"), NODE_TLS_REJECT_UNAUTHORIZED: '0' };
} catch (error) {
    throw new Error("Missing Secretes.json");
}

import './sqlite';
import cluster from 'cluster';
import * as os from 'os';
import path from 'path';

if (cluster.isPrimary) {

    // Take advantage of multiple CPUs
    const cpus = os.cpus().length;

    if (process.argv.includes('--no-cluster')) {
        cluster.fork(process.env);
    }
    else {
        for (let i = 0; i < Math.max(cpus, 4); i++) {
            cluster.fork(process.env);
        }
    }

    cluster.on("exit", (worker, code) => {
        if (code !== 0 && !worker.exitedAfterDisconnect) {
            const nw = cluster.fork();
        }
    });
} else {
    require(path.join(__dirname, "server"));
}