// Simulate browser; browsers will have `fetch` available.
import btoa from "btoa";
import { WTS } from "../src/web.js";

global.btoa = btoa;
// mocks
global.window = {};
const heap = {
  load: (appId) => {},
  identify: (userId) => {},
  track: (event, properties) => {},
};
global.heap = heap;

// mock some stuff
global.document = {
  title: "Webiny page title",
  referrer: "https://www.google.com",
  location: {
    search:
      "?utm_source=Dev-to&utm_medium=webiny-docs&utm_campaign=webiny-cross-promotion-nov-09&utm_content=webiny-doc-quick-start-page&utm_term=W00364",
  },
};
global.window = {
  heap: heap,
  location: {
    hostname: "www.webiny.com",
    href: "https://www.webiny.com/blog/article",
  },
};

(async () => {
  const wts = new WTS();

  await wts.identify("1.1.1.1");
  wts.trackEvent("test-event");
})().catch((err) => {
  console.error(err);
});
