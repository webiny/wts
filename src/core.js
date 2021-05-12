const defaultConfig = {
  FETCH: null,
  WTS_TELEMETRY_API: "https://t.webiny.com/",
  WTS_COOKIE: "wts_v2",
  WTS_DEBUG: true,
  WTS_VERSION: "2"
};

class WTSCore {
  constructor(config) {
    this.config = Object.assign({}, defaultConfig, config);
    this.client = this.config.FETCH;
    this.user = {};
    this.identified = false;

    if (!this.client) {
      throw Error(`Implementation class must provide a "fetch" client via config!`);
    }
  }

  /**
   * Send the telemetry payload back to the server.
   * Note this method doesn't wait for the response.
   *
   * @param {String} wts_method - Name of the API call method.
   * @param {Object} body - Payload to be sent.
   */
  _apiCall(wts_method, data) {
    try {
      this._debug("Api call: " + wts_method);
      this._debug(data);

      this.client(this.config.WTS_TELEMETRY_API, {
        method: "POST",
        body: JSON.stringify({
          wts_method: wts_method,
          wts_version: this.config.WTS_VERSION,
          data: data
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });
      this._debug("Api call issued");
    } catch (e) {
      this._debug(e);
      return false;
    }
  }

  _debug(msg) {
    if (this.config.WTS_DEBUG) {
      console.log(msg);
    }
  }
}

module.exports = { WTSCore };
