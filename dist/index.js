"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
try {
    process.env = require("../secretes.json");
}
catch (error) {
    throw new Error("Missing Secretes.json");
}
require("./server");
