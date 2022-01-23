const cluster = require('cluster');
const os = require('os');
const utils = require('./utils');

if (cluster.isMaster) {
    
    // Take advantage of multiple CPUs
    const cpus = os.cpus().length;

    utils.log(`Taking advantage of ${cpus} CPUs`)

    for (let i = 0; i < cpus; i++) {
        cluster.fork(process.env);
    }

    cluster.on('exit', (worker, code) => {
        if (code !== 0 && !worker.exitedAfterDisconnect) {
            utils.log(`\x1b[34mWorker ${worker.process.pid} crashed.\nStarting a new worker...\n\x1b[0m`);
            const nw = cluster.fork();
            utils.log(`\x1b[32mWorker ${nw.process.pid} will replace him \x1b[0m`);
        }
    });
} else {
    
     require('./serverProcess');
}