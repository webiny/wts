const defaultConfig = {
  FETCH: null,
  BTOA: null,
  WTS_TELEMETRY_API: "https://t.webiny.com/",
  WTS_COOKIE: "wts_v2",
  WTS_DEBUG: false,
  WTS_VERSION: "2.0"
};

class WTSCore {
  constructor(config) {
    this.config = Object.assign({}, defaultConfig, config);
    this.client = this.config.FETCH;
    this.btoa = this.config.BTOA;
    this.user = {};
    this.identified = false;

    if (!this.client) {
      throw Error(`Implementation class must provide a "fetch" client via config!`);
    }
  }

  /**
   * Tracks an event. Use this method to track any actions the user takes.
   *
   * @param {String} userId - User identifier.
   * @param {String} event - Event name.
   * @param {Object} properties - Additional attributes assigned to the event.
   */
  async trackEvent(userId, event, properties) {
    // ensure properties are an object
    if (typeof properties !== "object" || properties === null) {
      properties = {};
    }

    this._apiCall("event", {
      event: event,
      identity: userId,
      properties: properties
    });
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
      const payload = {
        wts_method: wts_method,
        wts_version: this.config.WTS_VERSION,
        data: data
      };

      this._debug("Api call: " + wts_method);
      this._debug(payload);

      const body = "wts=true&data=" + encodeURIComponent(this.btoa(JSON.stringify(payload)));
      this._debug(body);

      this.client(this.config.WTS_TELEMETRY_API, {
        method: "POST",
        body: body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
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
