// 확장자 없는 상대 import 를 .ts 로 이어 주는 최소 resolver — **테스트 하네스 전용**이다.
//
// 왜 필요한가
//   functions/ 의 배포 코드는 `from "../../../src/lib/..."` 처럼 확장자를 쓰지 않는다.
//   wrangler(esbuild)는 이것을 해석하지만 node --experimental-strip-types 는 못 한다.
//   그래서 live smoke 가 **실제 배포 handler 를 그대로** 부르려면 이 다리가 필요하다.
//
// 배포 코드는 건드리지 않는다. 이 훅은 스크립트를 돌릴 때만 로드된다.

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      // 상대 경로이고 확장자가 없을 때만 .ts / index.ts 를 시도한다
      if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) throw err;
      for (const suffix of [".ts", "/index.ts"]) {
        try {
          const url = new URL(specifier + suffix, context.parentURL);
          if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
        } catch { /* 다음 후보 */ }
      }
      throw err;
    }
  },
});
