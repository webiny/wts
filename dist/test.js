"use strict";

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

var _require = require('../dist'),
    WTS = _require.WTS; // mock some stuff


document = {
  title: 'Webiny page title',
  referrer: 'https://www.google.com',
  location: {
    search: '?utm_source=Dev-to&utm_medium=webiny-docs&utm_campaign=webiny-cross-promotion-nov-09&utm_content=webiny-doc-quick-start-page&utm_term=W00364'
  }
};
window = {
  location: {
    hostname: 'www.webiny.com'
  }
};

_asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
  var wts;
  return regeneratorRuntime.wrap(function _callee$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          wts = new WTS();
          _context.next = 3;
          return wts.identify('1.1.1.1', {
            t1: 'test',
            t2: 'test'
          }, {
            c1: 'test'
          });

        case 3:
          wts.trackPage();

        case 4:
        case "end":
          return _context.stop();
      }
    }
  }, _callee);
}))()["catch"](function (err) {
  console.error(err);
});