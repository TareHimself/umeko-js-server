
export default class Constants {
    static IS_DEV = true
    static SERVER_URL = Constants.IS_DEV ? 'http://localhost:9000' : 'https://server.umeko.dev'
    static CLIENT_ID = Constants.IS_DEV ? '895104527001354313' : '804165876362117141';
}