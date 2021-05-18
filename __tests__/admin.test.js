// Simulate browser; browsers will have `fetch` available.
global.fetch = require("node-fetch");
global.btoa = require("btoa");

const { WTS } = require("../src/admin");

// mock some stuff
document = {
  title: "Webiny page title",
  referrer: "https://www.google.com",
  location: {
    search:
      "?utm_source=Dev-to&utm_medium=webiny-docs&utm_campaign=webiny-cross-promotion-nov-09&utm_content=webiny-doc-quick-start-page&utm_term=W00364"
  }
};
window = {
  location: {
    hostname: "www.webiny.com",
    href: "https://www.webiny.com/blog/article"
  }
};

(async () => {
  const wts = new WTS();

  wts.trackEvent("1.1.1.1", "wts-admin-client-test", { email: "sven@webiny.com" });
})().catch((err) => {
  console.error(err);
});
