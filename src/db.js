const axios = require('axios');

module.exports = axios.create({
    baseURL: process.env.DB_API,
    headers: {
        'x-umeko-token': process.env.DB_API_TOKEN
    }
})