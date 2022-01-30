const axios = require('axios');
const cluster = require('cluster');

function time(sep = '') {

    const currentDate = new Date();

    if (sep === '') {
        return currentDate.toUTCString();
    }

    const date = ("0" + currentDate.getUTCDate()).slice(-2);

    const month = ("0" + (currentDate.getUTCMonth() + 1)).slice(-2);

    const year = currentDate.getUTCFullYear();

    const hours = ("0" + (currentDate.getUTCHours())).slice(-2);

    const minutes = ("0" + (currentDate.getUTCMinutes())).slice(-2);

    const seconds = ("0" + currentDate.getUTCSeconds()).slice(-2);

    return `${year}${sep}${month}${sep}${date}${sep}${hours}${sep}${minutes}${sep}${seconds}`;
}

function log(data) {

    const argumentValues = Object.values(arguments);

    const stack = new Error().stack;
    const pathDelimiter = process.platform !== 'win32' ? '/' : '\\';
    const simplifiedStack = stack.split('\n')[2].split(pathDelimiter);
    const file = simplifiedStack[simplifiedStack.length - 1].split(')')[0];
    argumentValues.unshift(`${file} ::`);

    argumentValues.unshift(`${cluster.isMaster ? "Master" : "Child"} ID-${process.pid} ::`);

    argumentValues.unshift(`${time(':')} ::`);

    console.log.apply(null,argumentValues);
}

function utcInSeconds()
{
    return Math.floor(Date.now()/1000);
}

module.exports.time = time;
module.exports.utcInSeconds = utcInSeconds;
module.exports.log = log;