const cluster = require('cluster');
const os = require('os');
const utils = require('./utils');
const fs = require('fs');
const axios = require('axios');


if (cluster.isMaster) {

    const localDb = require('better-sqlite3')('./src/sessionStore.db', { fileMustExist: true });
    localDb.pragma('journal_mode = WAL');
    setInterval(fs.stat.bind(null, './src/sessionStore.db-wal', (err, stat) => {
        if (err) {
            if (err.code !== 'ENOENT') throw err;
        } else if (stat.size / (1024 * 1024) > 50) {
            localDb.pragma('wal_checkpoint(RESTART)');
        }
    }), 5000).unref();

    if (!fs.existsSync('./src/backups')) fs.mkdirSync('./src/backups');

    setInterval(() => {
        localDb.backup(`./src/backups/backup-${utils.time('-')}.db`);
    }, 1.44e+7).unref();// every 4 hours

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