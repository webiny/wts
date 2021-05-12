'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WTS = void 0;

var _jsCookie = _interopRequireDefault(require("js-cookie"));

var _crossFetch = _interopRequireDefault(require("cross-fetch"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _typeof(obj) { "@babel/helpers - typeof"; if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var WTS_TELEMETRY_API = 'https://t.webiny.com/';
var WTS_COOKIE = 'wts_v2';
var WTS_DEBUG = true;
var WTS_VERSION = '2';

var WTS = /*#__PURE__*/function () {
  function WTS() {
    _classCallCheck(this, WTS);

    this.user = {};
    this.identified = false;
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


  _createClass(WTS, [{
    key: "identify",
    value: function () {
      var _identify = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(userId, traits, context) {
        var user;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                this._debug('called identify'); // skip tracking for gatsby builds


                if (!(typeof document === "undefined")) {
                  _context.next = 3;
                  break;
                }

                return _context.abrupt("return", false);

              case 3:
                if (!(typeof userId === 'undefined' || userId === false || userId === null)) {
                  _context.next = 7;
                  break;
                }

                _context.next = 6;
                return this._getUserIp();

              case 6:
                userId = _context.sent;

              case 7:
                this._debug('User id set to:' + userId); // parse user traits


                if (_typeof(traits) !== 'object' || traits === null) {
                  traits = {};
                } // build the user object


                user = {
                  userId: userId,
                  traits: traits,
                  context: context
                };

                this._apiCall('identify', user);

                this.identified = true;

              case 12:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function identify(_x, _x2, _x3) {
        return _identify.apply(this, arguments);
      }

      return identify;
    }()
    /**
     * Tracks an event. Use this method to track any actions the user takes.
     *
     * @param {String} event - Event name.
     * @param {Object} properties - Additional attributes assigned to the event.
     */

  }, {
    key: "trackEvent",
    value: function () {
      var _trackEvent = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(event, properties) {
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!(typeof document === "undefined")) {
                  _context2.next = 2;
                  break;
                }

                return _context2.abrupt("return", false);

              case 2:
                if (this.identified) {
                  _context2.next = 4;
                  break;
                }

                throw new Error('WTS: You need to identify the user before you can call the trackEvent method.');

              case 4:
                // ensure properties are an object
                if (_typeof(properties) !== 'object' || properties === null) {
                  properties = {};
                }

                this._apiCall('event', {
                  event: event,
                  properties: properties
                });

              case 6:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function trackEvent(_x4, _x5) {
        return _trackEvent.apply(this, arguments);
      }

      return trackEvent;
    }()
    /**
     * Tracks a page view. Use this method to track page navigation events.
     *
     * @param {Object} properties - Additional properties to be assigned to the page view event.
     */

  }, {
    key: "trackPage",
    value: function () {
      var _trackPage = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3(properties) {
        var utm, referrer;
        return regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                if (!(typeof document === "undefined")) {
                  _context3.next = 2;
                  break;
                }

                return _context3.abrupt("return", false);

              case 2:
                if (this.identified) {
                  _context3.next = 4;
                  break;
                }

                throw new Error('WTS: You need to identify the user before you can call the trackPage method.');

              case 4:
                // ensure properties are an object
                if (_typeof(properties) !== 'object' || properties === null) {
                  properties = {};
                } // append basic metadata


                properties.pageTitle = document.title; // get UTM data if available

                utm = this._parseUtmData();

                if (utm !== null) {
                  properties = _objectSpread(_objectSpread({}, properties), utm);
                } // get referrer data if available


                referrer = this._parseReferrerData();

                if (referrer !== null) {
                  properties = _objectSpread(_objectSpread({}, properties), referrer);
                }

                this.trackEvent('page-view', properties);

              case 11:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function trackPage(_x6) {
        return _trackPage.apply(this, arguments);
      }

      return trackPage;
    }()
    /**
     * Send the telemetry payload back to the server.
     * Note this method doesn't wait for the response.
     *
     * @param {String} wts_method - Name of the API call method.
     * @param {Object} body - Payload to be sent.
     */

  }, {
    key: "_apiCall",
    value: function _apiCall(wts_method, data) {
      try {
        this._debug('Api call: ' + wts_method);

        this._debug(data);

        (0, _crossFetch["default"])(WTS_TELEMETRY_API, {
          method: 'POST',
          body: JSON.stringify({
            wts_method: wts_method,
            wts_version: WTS_VERSION,
            data: data
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });

        this._debug('Api call issued');
      } catch (e) {
        _debug(e);

        return false;
      }
    }
    /**
     * Returns the user's IP address
     */

  }, {
    key: "_getUserIp",
    value: function () {
      var _getUserIp2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee4() {
        var response, userData;
        return regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                // retrieve user IP from the cookie
                this.user = this.getUserFromCookie();

                if (!this.user.hasOwnProperty('ip')) {
                  _context4.next = 4;
                  break;
                }

                this._debug('User IP retrieved from the cookie.');

                return _context4.abrupt("return", this.user.ip);

              case 4:
                _context4.prev = 4;
                _context4.next = 7;
                return (0, _crossFetch["default"])('https://api.ipify.org/?format=json', {
                  method: 'GET',
                  mode: 'cors'
                });

              case 7:
                response = _context4.sent;
                _context4.next = 10;
                return response.json();

              case 10:
                userData = _context4.sent;
                // save into local state
                this.user.ip = userData.ip; // save user into cookie

                this.saveUserCookie();

                this._debug('User IP retrieved from the IP-API.');

                return _context4.abrupt("return", this.user.ip);

              case 17:
                _context4.prev = 17;
                _context4.t0 = _context4["catch"](4);

                this._debug('Unable to retrieve the user IP.');

                this._debug(_context4.t0);

                return _context4.abrupt("return", false);

              case 22:
              case "end":
                return _context4.stop();
            }
          }
        }, _callee4, this, [[4, 17]]);
      }));

      function _getUserIp() {
        return _getUserIp2.apply(this, arguments);
      }

      return _getUserIp;
    }()
    /**
     * Returns the domain name. It's important for the cookie.
     */

  }, {
    key: "_getDomainName",
    value: function _getDomainName() {
      return window.location.hostname.replace(/www|docs|blog/gi, '');
    }
    /**
     * Retrieves the user from the cookie.
     */

  }, {
    key: "getUserFromCookie",
    value: function getUserFromCookie() {
      if (_jsCookie["default"].get(WTS_COOKIE)) {
        return JSON.parse(_jsCookie["default"].get(WTS_COOKIE));
      }

      return {};
    }
    /**
     * Saves the current this.user to cookie
     */

  }, {
    key: "saveUserCookie",
    value: function saveUserCookie() {
      _jsCookie["default"].set(WTS_COOKIE, JSON.stringify(this.user), {
        expires: 365,
        domain: this._getDomainName()
      });
    }
    /**
     * Extracts and returns the UTM query strings.
     */

  }, {
    key: "_parseUtmData",
    value: function _parseUtmData() {
      if (!document.location.search || document.location.search == '') {
        this._debug('UTM data not available');

        return null;
      } // parse the query strings


      var vars = document.location.search.substring(1).split('&');
      var queryStrings = {};

      for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        var name = decodeURIComponent(pair[0]);

        if (name.indexOf('utm_') !== -1) {
          // some cleanup stupp
          name = name.replace(/amp;|;/gi, '');
          name = name.replace(/utm_/gi, '');
          var value = decodeURIComponent(pair[1]).replace(/amp;|;/gi, '');
          queryStrings['utm' + name.charAt(0).toUpperCase() + name.slice(1)] = value;
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

  }, {
    key: "_parseReferrerData",
    value: function _parseReferrerData() {
      // referrer domain
      var referrer = document.referrer; // https://github.com/segmentio/inbound

      if (typeof referrer === 'undefined' || referrer === null || !referrer || referrer === '') {
        return null;
      } // before doing any analysis of the referrer, let's check if ref is another internal page


      if (referrer.indexOf('https://www.webiny.com') === 0 || referrer.indexOf('https://docs.webiny.com') === 0 || referrer.indexOf('localhost') !== -1) {
        return null;
      }

      var network = null; // facebook

      if (referrer.indexOf('facebook.com') !== -1) {
        network = 'facebook';
      } // twitter


      if (referrer.indexOf('twitter.com') !== -1 || referrer.indexOf('t.co') !== -1) {
        network = 'twitter';
      } // linkedin


      if (referrer.indexOf('linkedin.com') !== -1 || referrer.indexOf('lnkd.in') !== -1) {
        network = 'linkedin';
      } // reddit


      if (referrer.indexOf('reddit.com') !== -1) {
        network = 'reddit';
      } // producthunt


      if (referrer.indexOf('producthunt.com') !== -1) {
        network = 'producthunt';
      } // hackernoon


      if (referrer.indexOf('hackernoon.com') !== -1) {
        network = 'hackernoon';
      } // google search (has to be before the google ad service)
      // note: don't add TLD


      if (referrer.indexOf('google') !== -1) {
        network = 'google-search';
      } // google ad service


      if (referrer.indexOf('googleadservices.com') !== -1) {
        network = 'google-ads';
      } // baidu


      if (referrer && referrer.indexOf('baidu.com') !== -1) {
        network = 'baidu';
      } // yandex


      if (referrer && referrer.indexOf('yandex.com') !== -1) {
        network = 'yandex';
      } // bing


      if (referrer && referrer.indexOf('bing.com') !== -1) {
        network = 'bing';
      } // gmail


      if (referrer && referrer.indexOf('mail.google.com') !== -1) {
        network = 'google-mail';
      } // github


      if (referrer.indexOf('github.com') !== -1) {
        network = 'github';
      } // npm


      if (referrer.indexOf('npmjs.com') !== -1) {
        network = 'npm';
      } // webiny blog


      if (referrer.indexOf('blog.webiny.com') !== -1) {
        network = 'webiny-blog';
      } // youtube


      if (referrer.indexOf('youtube.com') !== -1 || referrer.indexOf('youtu.be') !== -1) {
        network = 'youtube';
      }

      return {
        referrerSource: network,
        // network is null if we haven't matched it
        referrerDomain: referrer.replace(/https:\/\/|http\/\/|\//gi, '')
      };
    }
  }, {
    key: "_debug",
    value: function _debug(msg) {
      if (WTS_DEBUG) {
        console.log(msg);
      }
    }
  }]);

  return WTS;
}();

exports.WTS = WTS;