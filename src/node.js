const fetch = require("node-fetch");
const { WTSCore } = require("./core");

/**
 * Use `node-fetch`, as we already use it in other Webiny packages, so it won't add to the bundle size.
 */
class WTS extends WTSCore {
    constructor(config = {}) {
        super({ FETCH: fetch, ...config });
    }
}

module.exports = { WTS };
