import { WTS } from "../src/node.js";

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
  location: {
    hostname: "www.webiny.com",
  },
};

(async () => {
  const wts = new WTS();

  wts.trackEvent("1.1.1.1", "wts-test", { domain: "test.com" });
})().catch((err) => {
  console.error(err);
});
