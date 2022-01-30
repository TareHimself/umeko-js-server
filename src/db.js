const axios = require('axios');

module.exports = axios.create({
    baseURL: process.env.DB_API,
    headers: {
        'x-api-key': process.env.DB_API_TOKEN
    }
})