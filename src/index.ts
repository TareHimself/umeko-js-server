try {
    process.env = require("../secretes.json");
} catch (error) {
    throw new Error("Missing Secretes.json");
}

import './server'