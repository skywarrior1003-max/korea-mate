// GoKoreaMate / gokoreamate.com — Trip Personalization Profile: Gemini 호출
//
// 이 파일이 하는 일은 하나다 — prompt 를 받아 Gemini 에 **한 번** 물어보고
// 돌아온 것을 그대로 넘긴다. 해석도 판단도 하지 않는다.
//
// 왜 gemini-client.ts 를 쓰지 않았나
//   그쪽은 장소 설명 문장(PlaceExplanation)용이고 요청 형태가 다르다 —
//   role 이 붙고, responseSchema 와 thinkingConfig 가 없고, 토큰 상한도
//   2048 이다. 여기에 맞추려고 그 파일을 손대면 멀쩡한 다른 기능이 바뀐다.
//   이름이 비슷하다는 이유로 합치지 않는다.
//
// 왜 route 에서 꺼냈나
//   Production route 와 로컬 harness 가 각각 자기 fetch 를 갖게 되면, 검증한
//   것과 실제로 나가는 것이 달라진다. 호출 코드는 한 벌이어야 한다.
//
// 재시도는 없다. 어떤 실패에서도 두 번째 요청을 만들지 않는다 —
// 과거 비용 사고가 반복 호출에서 났다.

import {
  MODEL, TIMEOUT_MS, MAX_OUTPUT_TOKENS, RESPONSE_SCHEMA,
} from "./profile-personalization-core.ts";

/** 우리가 읽는 부분만. provider 가 더 보내도 그대로 흘려보낸다. */
export interface ProfileProviderRaw {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string; finishMessage?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number; candidatesTokenCount?: number;
    thoughtsTokenCount?: number; totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export type ProfileProviderResult =
  | { ok: true;  latencyMs: number; raw: ProfileProviderRaw; text: string }
  /** 200 이 아니다. 400·401·403·404·408·429·5xx 가 전부 여기로 온다. */
  | { ok: false; latencyMs: number; kind: "http"; httpStatus: number }
  /** TIMEOUT_MS 를 넘겼다. 늦게 오는 응답도 버린다. */
  | { ok: false; latencyMs: number; kind: "timeout" }
  /** network 오류거나 응답이 JSON 이 아니었다. */
  | { ok: false; latencyMs: number; kind: "error" };

export interface ProfileProviderArgs {
  prompt: string;
  /** 호출 시점에 주입한다. 이 모듈은 환경변수를 읽지 않는다. */
  apiKey: string;
  /** 테스트·harness 가 주입한다. 없으면 런타임 기본 fetch. */
  fetchFn?: typeof fetch;
}

/** provider 로 나가는 요청 본문. 순수 함수라 호출 없이도 확인할 수 있다. */
export function buildProviderRequestBody(prompt: string): unknown {
  return {
    contents:         [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens:  MAX_OUTPUT_TOKENS,
      temperature:      0.3,
      // 형식을 부탁하지 않고 계약으로 건다
      responseMimeType: "application/json",
      responseSchema:   RESPONSE_SCHEMA,
      // 제한된 스키마 채우기다. thinking 을 켜두면 그 토큰이
      // maxOutputTokens 를 먹어 답이 잘린다.
      thinkingConfig:   { thinkingBudget: 0 },
    },
  };
}

export function buildProviderUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
}

/** 정확히 1회. 재시도 루프가 없다. */
export async function callProfileProvider(
  args: ProfileProviderArgs,
): Promise<ProfileProviderResult> {
  const started       = Date.now();
  const providerFetch = args.fetchFn ?? fetch;
  const controller    = new AbortController();
  const timer         = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await providerFetch(buildProviderUrl(args.apiKey), {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  controller.signal,
      body:    JSON.stringify(buildProviderRequestBody(args.prompt)),
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      return { ok: false, latencyMs, kind: "http", httpStatus: res.status };
    }

    const raw   = (await res.json()) as ProfileProviderRaw;
    const parts = raw.candidates?.[0]?.content?.parts ?? [];
    const text  = parts[0]?.text ?? "";
    return { ok: true, latencyMs, raw, text };

  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, latencyMs: Date.now() - started, kind: isAbort ? "timeout" : "error" };
  }
}
