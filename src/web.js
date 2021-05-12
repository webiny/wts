"use strict";

const Cookies = require("js-cookie");
const { WTSCore } = require("./core");

class WTS extends WTSCore {
  constructor(config = {}) {
    super({ FETCH: fetch, ...config });
  }

  /**
   * Identify the user. If you set userId to false, the system will detect user's IP
   * and use that as the identifier. Note: it's recommended that you always provide
   * an IP as detecting user's API is an external API call and can take some time.
   *
   * @param {String} userId - User ID.
   * @param {Object} traits - List of user attributes.
   * @param {Object} context - Additional context to the user profile.
   */
  async identify(userId, traits, context) {
    this._debug("called identify");
    // skip tracking for gatsby builds
    if (typeof document === `undefined`) {
      return false;
    }

    // get userId from his IP
    if (typeof userId === "undefined" || userId === false || userId === null) {
      userId = await this._getUserIp();
    }
    this._debug("User id set to:" + userId);

    // parse user traits
    if (typeof traits !== "object" || traits === null) {
      traits = {};
    }

    // build the user object
    const user = {
      userId: userId,
      traits: traits,
      context: context
    };

    this._apiCall("identify", user);
    this.identified = true;
  }

  /**
   * Tracks an event. Use this method to track any actions the user takes.
   *
   * @param {String} event - Event name.
   * @param {Object} properties - Additional attributes assigned to the event.
   */
  async trackEvent(event, properties) {
    // skip tracking for gatsby builds
    if (typeof document === `undefined`) {
      return false;
    }

    if (!this.identified) {
      throw new Error(
        "WTS: You need to identify the user before you can call the trackEvent method."
      );
    }

    // ensure properties are an object
    if (typeof properties !== "object" || properties === null) {
      properties = {};
    }

    this._apiCall("event", {
      event,
      properties
    });
  }

  /**
   * Tracks a page view. Use this method to track page navigation events.
   *
   * @param {Object} properties - Additional properties to be assigned to the page view event.
   */
  async trackPage(properties) {
    // skip tracking for gatsby builds
    if (typeof document === `undefined`) {
      return false;
    }

    if (!this.identified) {
      throw new Error(
        "WTS: You need to identify the user before you can call the trackPage method."
      );
    }

    // ensure properties are an object
    if (typeof properties !== "object" || properties === null) {
      properties = {};
    }

    // append basic metadata
    properties.pageTitle = document.title;

    // get UTM data if available
    const utm = this._parseUtmData();
    if (utm !== null) {
      properties = { ...properties, ...utm };
    }

    // get referrer data if available
    const referrer = this._parseReferrerData();
    if (referrer !== null) {
      properties = { ...properties, ...referrer };
    }

    this.trackEvent("page-view", properties);
  }

  /**
   * Returns the user's IP address
   */
  async _getUserIp() {
    // retrieve user IP from the cookie
    this.user = this.getUserFromCookie();
    if (this.user.hasOwnProperty("ip")) {
      this._debug("User IP retrieved from the cookie.");
      return this.user.ip;
    }

    // retrieve the user IP from the IP-API
    try {
      const response = await fetch("https://api.ipify.org/?format=json", {
        method: "GET",
        mode: "cors"
      });

      const userData = await response.json();

      // save into local state
      this.user.ip = userData.ip;

      // save user into cookie
      this.saveUserCookie();

      this._debug("User IP retrieved from the IP-API.");

      return this.user.ip;
    } catch (e) {
      this._debug("Unable to retrieve the user IP.");
      this._debug(e);
      return false;
    }
  }

  /**
   * Returns the domain name. It's important for the cookie.
   */
  _getDomainName() {
    return window.location.hostname.replace(/www|docs|blog/gi, "");
  }

  /**
   * Retrieves the user from the cookie.
   */
  getUserFromCookie() {
    if (Cookies.get(WTS_COOKIE)) {
      return JSON.parse(Cookies.get(WTS_COOKIE));
    }

    return {};
  }

  /**
   * Saves the current this.user to cookie
   */
  saveUserCookie() {
    Cookies.set(WTS_COOKIE, JSON.stringify(this.user), {
      expires: 365,
      domain: this._getDomainName()
    });
  }

  /**
   * Extracts and returns the UTM query strings.
   */
  _parseUtmData() {
    if (!document.location.search || document.location.search == "") {
      this._debug("UTM data not available");
      return null;
    }

    // parse the query strings
    const vars = document.location.search.substring(1).split("&");
    const queryStrings = {};
    for (let i = 0; i < vars.length; i++) {
      let pair = vars[i].split("=");
      let name = decodeURIComponent(pair[0]);

      if (name.indexOf("utm_") !== -1) {
        // some cleanup stupp
        name = name.replace(/amp;|;/gi, "");
        name = name.replace(/utm_/gi, "");
        const value = decodeURIComponent(pair[1]).replace(/amp;|;/gi, "");
        queryStrings["utm" + name.charAt(0).toUpperCase() + name.slice(1)] = value;
      }
    }

    if (Object.keys(queryStrings).length < 1) {
      return null;
    }

    return queryStrings;
  }

  /**
   * Parses the referrer domain name.
   *
   * Returns 'null' in case of a `direct` access or in case a ref page is another page
   * on the same domain. In all other cases, it returns an object.
   */
  _parseReferrerData() {
    // referrer domain
    const referrer = document.referrer;

    // https://github.com/segmentio/inbound
    if (typeof referrer === "undefined" || referrer === null || !referrer || referrer === "") {
      return null;
    }

    // before doing any analysis of the referrer, let's check if ref is another internal page
    if (
      referrer.indexOf("https://www.webiny.com") === 0 ||
      referrer.indexOf("https://docs.webiny.com") === 0 ||
      referrer.indexOf("localhost") !== -1
    ) {
      return null;
    }

    let network = null;

    // facebook
    if (referrer.indexOf("facebook.com") !== -1) {
      network = "facebook";
    }

    // twitter
    if (referrer.indexOf("twitter.com") !== -1 || referrer.indexOf("t.co") !== -1) {
      network = "twitter";
    }

    // linkedin
    if (referrer.indexOf("linkedin.com") !== -1 || referrer.indexOf("lnkd.in") !== -1) {
      network = "linkedin";
    }

    // reddit
    if (referrer.indexOf("reddit.com") !== -1) {
      network = "reddit";
    }

    // producthunt
    if (referrer.indexOf("producthunt.com") !== -1) {
      network = "producthunt";
    }

    // hackernoon
    if (referrer.indexOf("hackernoon.com") !== -1) {
      network = "hackernoon";
    }

    // google search (has to be before the google ad service)
    // note: don't add TLD
    if (referrer.indexOf("google") !== -1) {
      network = "google-search";
    }

    // google ad service
    if (referrer.indexOf("googleadservices.com") !== -1) {
      network = "google-ads";
    }

    // baidu
    if (referrer && referrer.indexOf("baidu.com") !== -1) {
      network = "baidu";
    }

    // yandex
    if (referrer && referrer.indexOf("yandex.com") !== -1) {
      network = "yandex";
    }

    // bing
    if (referrer && referrer.indexOf("bing.com") !== -1) {
      network = "bing";
    }

    // gmail
    if (referrer && referrer.indexOf("mail.google.com") !== -1) {
      network = "google-mail";
    }

    // github
    if (referrer.indexOf("github.com") !== -1) {
      network = "github";
    }

    // npm
    if (referrer.indexOf("npmjs.com") !== -1) {
      network = "npm";
    }

    // webiny blog
    if (referrer.indexOf("blog.webiny.com") !== -1) {
      network = "webiny-blog";
    }

    // youtube
    if (referrer.indexOf("youtube.com") !== -1 || referrer.indexOf("youtu.be") !== -1) {
      network = "youtube";
    }

    return {
      referrerSource: network, // network is null if we haven't matched it
      referrerDomain: referrer.replace(/https:\/\/|http\/\/|\//gi, "")
    };
  }
}

module.exports = { WTS };
