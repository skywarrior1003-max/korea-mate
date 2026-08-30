import { test } from "node:test";
import assert from "node:assert/strict";
import { stripIngestAnnotation, hasIngestAnnotation, displayPlaceName, displayPlaceText, pickL10n } from "./place-display-name.ts";

test("★수집 주석 `(한,영,중간,중번,일)` 만 뗀다 — 진짜 괄호 이름은 그대로", () => {
  assert.equal(stripIngestAnnotation("송정 구덕포길(한,영,중간,중번,일)"), "송정 구덕포길");
  assert.equal(stripIngestAnnotation("아홉산 숲 (한,영,중간,중번,일)"), "아홉산 숲");
  assert.equal(stripIngestAnnotation("롯데월드 어드벤처 부산 (한, 영, 중간, 중번, 일)"), "롯데월드 어드벤처 부산");
  assert.equal(stripIngestAnnotation("국립해양박물관(한,영)"), "국립해양박물관");
  assert.equal(stripIngestAnnotation("금수복국 (해운대)"), "금수복국 (해운대)", "진짜 지점명 괄호는 유지");
  assert.equal(stripIngestAnnotation("Gumsu Bokkuk (Haeundae)"), "Gumsu Bokkuk (Haeundae)");
  assert.equal(stripIngestAnnotation("한일관 (중식)"), "한일관 (중식)", "어휘 밖 토큰이 섞이면 건드리지 않는다");
  assert.equal(stripIngestAnnotation("(한,영)"), "(한,영)", "이름 전체가 주석뿐이면 비우지 않는다");
  assert.equal(hasIngestAnnotation("용두산공원(한,영,중간,중번,일)"), true);
  assert.equal(hasIngestAnnotation("용두산공원"), false);
});

test("★locale 이름 — 실제 l10n 만, 없으면 원문. 번역을 만들지 않는다", () => {
  assert.equal(displayPlaceName("Haeundae Beach: The Busan representative", { ko: "해운대" }, "ko"), "해운대");
  assert.equal(displayPlaceName("Haeundae Beach: The Busan representative", { ko: "해운대" }, "ko-KR"), "해운대");
  assert.equal(displayPlaceName("Haeundae Beach: The Busan representative", { ko: "해운대" }, "en"), "Haeundae Beach: The Busan representative");
  assert.equal(displayPlaceName("Igidae Coastal Walk", { ko: null }, "ko"), "Igidae Coastal Walk");
  assert.equal(displayPlaceName("Igidae Coastal Walk", null, "ja"), "Igidae Coastal Walk");
  assert.equal(displayPlaceName("Songjeong Gudeokpo-gil", { ko: "송정 구덕포길(한,영,중간,중번,일)" }, "ko"), "송정 구덕포길");
  assert.equal(pickL10n({ ko: "  " }, "ko"), null, "공백만이면 없는 것");
});

test("★설명 — 실제 KO 설명이 있으면 그것, 없으면 원문, 둘 다 없으면 null", () => {
  assert.equal(displayPlaceText("English desc", { ko: "한글 설명" }, "ko"), "한글 설명");
  assert.equal(displayPlaceText("English desc", { ko: "" }, "ko"), "English desc");
  assert.equal(displayPlaceText("", null, "ko"), null);
});
