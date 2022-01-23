const tableSchemas = require('./tableSchemas.json');

const schemas = Object.keys(tableSchemas);

const sessionStore = require('better-sqlite3')('./src/sessionStore.db', { fileMustExist: true });

schemas.forEach(function (schema) {

    const table = tableSchemas[schema];

    const deleteStatement = `DROP TABLE IF EXISTS \`${table.name}\`;`;

    sessionStore.prepare(deleteStatement).run();
    console.log(`Deleted Table ${table.name}`);

    let createStatement = `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;

    table.rows.forEach(element => {
        createStatement += `${element.name} ${element.type} ${element.option} ${element === table.rows[table.rows.length - 1] ? "" : ","}\n`
    });

    createStatement += ');';

    sessionStore.prepare(createStatement).run();
    console.log(`Created Table ${table.name}`);
});