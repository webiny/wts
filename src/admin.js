import { WTSCore } from "./core.js";

export class WTS extends WTSCore {
  constructor(config = {}) {
    super({
      FETCH: fetch.bind(window),
      BTOA: btoa.bind(window),
      ...config,
    });
  }
}
