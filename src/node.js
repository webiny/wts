import btoa from "btoa";
import { WTSCore } from "./core.js";

export class WTS extends WTSCore {
  constructor(config = {}) {
    super({
      FETCH: fetch,
      BTOA: btoa,
      ...config,
    });
  }
}
