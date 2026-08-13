// Cloudflare 보안 설정(WAF·Rate Limiting)을 다룰 때의 안전 규칙. 순수 함수만 있다.
//
// 왜 이 파일이 있나
//   Cloudflare 설정은 잘못 건드리면 사이트가 통째로 막히거나, 반대로 막고
//   있던 것이 조용히 열린다. 그리고 되돌리기 전까지 아무도 모른다.
//   그래서 "무엇을 바꿀 수 있는가" 를 코드로 못 박아 둔다.
//
// 이 파일이 지키는 것
//   · 읽기와 쓰기의 자격 증명을 분리한다. 배포용 토큰으로 방화벽을 바꾸지 않는다.
//   · 쓰기는 네 개의 문을 전부 통과해야 한다 — 전용 토큰, 명시적 실행 옵션,
//     정확한 확인 문구, 정확한 대상.
//   · 대상 zone 은 하나뿐이다. 와일드카드도 전체도 없다.
//   · 있던 규칙은 건드리지 않는다. 지우는 것은 따로 승인받는다.
//   · 바꾸기 전과 후를 찍어 두고, 승인한 것 말고 뭔가 달라졌으면 실패로 본다.
//
// 여기에는 네트워크도 secret 도 없다. 토큰은 이름만 다루고 값은 만지지 않는다.

// ── 자격 증명 역할 분리 ──────────────────────────────────────────────────────
//
// 이름만 안다. 값은 이 계층에 들어오지 않는다.

/** Pages 배포 전용. 이 토큰으로 방화벽을 만지지 않는다. */
export const PAGES_TOKEN_ENV = "CLOUDFLARE_API_TOKEN";
/** zone·WAF 조회 전용. 절대 쓰기에 쓰지 않는다. */
export const SECURITY_READ_TOKEN_ENV = "CLOUDFLARE_SECURITY_READ_TOKEN";
/** 승인된 변경 TASK 에서만. */
export const SECURITY_WRITE_TOKEN_ENV = "CLOUDFLARE_SECURITY_WRITE_TOKEN";

export type CloudflareRole = "pages" | "security-read" | "security-write";

const ROLE_ENV: Record<CloudflareRole, string> = {
  "pages":          PAGES_TOKEN_ENV,
  "security-read":  SECURITY_READ_TOKEN_ENV,
  "security-write": SECURITY_WRITE_TOKEN_ENV,
};

/** 그 역할이 쓰는 환경변수 이름. 값이 아니라 이름이다. */
export function envNameForRole(role: CloudflareRole): string {
  return ROLE_ENV[role];
}

/**
 * 역할에 맞는 자격 증명이 있는가.
 *
 * **다른 역할의 토큰으로 대신하지 않는다.** 읽기 토큰이 없다고 배포 토큰을
 * 끌어다 쓰면 분리한 의미가 없다 — 그건 분리가 아니라 이름만 바꾼 것이다.
 */
export function resolveRoleCredential(
  role: CloudflareRole,
  present: Readonly<Record<string, boolean>>,
): { ok: true; envName: string } | { ok: false; envName: string; reason: "missing" } {
  const envName = ROLE_ENV[role];
  return present[envName] ? { ok: true, envName } : { ok: false, envName, reason: "missing" };
}

// ── zone 제한 ────────────────────────────────────────────────────────────────

/** 이 도구가 다루는 유일한 zone. 늘리려면 승인이 필요하다. */
export const ALLOWED_ZONE = "gokoreamate.com";

export function isAllowedZone(zone: string): boolean {
  return zone.trim().toLowerCase() === ALLOWED_ZONE;
}

// ── 읽기 경로 ────────────────────────────────────────────────────────────────

/** 조회에 쓸 수 있는 method. 이 목록 밖은 읽기 도구가 거부한다. */
export const READ_METHODS = ["GET", "HEAD"] as const;
export type ReadMethod = typeof READ_METHODS[number];

export function isReadMethod(m: string): m is ReadMethod {
  return (READ_METHODS as readonly string[]).includes(m.toUpperCase());
}

// ── 쓰기 4중 게이트 ──────────────────────────────────────────────────────────

/** 실제 변경에 요구하는 고정 문구. 오타는 통과하지 못한다. */
export const CONFIRM_PHRASE = "CLOUDFLARE-SECURITY-CHANGE-APPROVED";

export type WriteOperation = "create-rule" | "update-rule" | "delete-rule";

export interface WriteTarget {
  zone:      string;
  operation: WriteOperation;
  /** 만들 규칙의 이름, 또는 고칠·지울 규칙의 식별자. 와일드카드 금지. */
  ruleRef:   string;
}

export type WriteBlockReason =
  | "missing_write_token"
  | "wrong_token_role"
  | "not_applied"
  | "confirm_missing"
  | "zone_not_allowed"
  | "target_missing"
  | "target_wildcard"
  | "delete_not_approved"
  | "modifies_existing_rule";

export interface WriteGateInput {
  /** 어떤 환경변수가 있는지. 값은 넘기지 않는다. */
  present:        Readonly<Record<string, boolean>>;
  /** `--apply` 가 붙었는가. 기본은 dry-run 이다. */
  applied:        boolean;
  /** `--confirm=` 로 들어온 문구. */
  confirm:        string | null;
  target:         WriteTarget | null;
  /** 오너가 이번 TASK 에서 삭제를 명시적으로 승인했는가. */
  deleteApproved?: boolean;
  /** 이번 TASK 에서 기존 규칙 수정을 명시적으로 승인했는가. */
  updateApproved?: boolean;
}

const WILDCARDS = ["*", "all", "any", ""];

/**
 * 네 개의 문을 전부 통과해야 변경할 수 있다.
 *
 * 통과하지 못하면 이유를 돌려준다. 부르는 쪽은 그 이유를 사람에게 보여주고
 * 아무것도 바꾸지 않는다 — provider mutation 0.
 */
export function evaluateWriteGate(
  input: WriteGateInput,
): { allowed: true; target: WriteTarget } | { allowed: false; reason: WriteBlockReason } {
  // Gate 1 — 전용 쓰기 토큰. 배포 토큰·읽기 토큰으로 대신하지 않는다.
  const cred = resolveRoleCredential("security-write", input.present);
  if (!cred.ok) return { allowed: false, reason: "missing_write_token" };

  // Gate 2 — 기본은 dry-run 이다.
  if (!input.applied) return { allowed: false, reason: "not_applied" };

  // Gate 3 — 정확한 확인 문구.
  if (input.confirm !== CONFIRM_PHRASE) return { allowed: false, reason: "confirm_missing" };

  // Gate 4 — 정확한 대상.
  const t = input.target;
  if (!t) return { allowed: false, reason: "target_missing" };
  if (!isAllowedZone(t.zone)) return { allowed: false, reason: "zone_not_allowed" };
  const ref = t.ruleRef.trim().toLowerCase();
  if (WILDCARDS.includes(ref)) return { allowed: false, reason: "target_wildcard" };

  // 지우는 것과 고치는 것은 따로 승인받는다. "정리" 는 이유가 되지 않는다.
  if (t.operation === "delete-rule" && input.deleteApproved !== true) {
    return { allowed: false, reason: "delete_not_approved" };
  }
  if (t.operation === "update-rule" && input.updateApproved !== true) {
    return { allowed: false, reason: "modifies_existing_rule" };
  }

  return { allowed: true, target: { ...t, zone: ALLOWED_ZONE } };
}

// ── snapshot / diff ──────────────────────────────────────────────────────────

/** 규칙 하나에서 우리가 기록하는 것. secret 은 담지 않는다. */
export interface RuleSnapshot {
  id:          string;
  name:        string;
  expression:  string;
  action:      string;
  enabled:     boolean;
  /** rate limit 규칙에만 있다. */
  threshold?:  number;
  period?:     number;
  /** 순서가 의미 있는 phase 를 위해 남긴다. */
  position?:   number;
}

export interface ZoneSnapshot {
  zone:      string;
  phase:     string;
  rules:     RuleSnapshot[];
  /** 사람이 언제 찍은 것인지 알 수 있게. 호출부가 넣는다. */
  takenAt:   string;
}

export interface SnapshotDiff {
  added:     RuleSnapshot[];
  removed:   RuleSnapshot[];
  changed:   { before: RuleSnapshot; after: RuleSnapshot; fields: string[] }[];
  unchanged: number;
}

const COMPARED_FIELDS: (keyof RuleSnapshot)[] =
  ["name", "expression", "action", "enabled", "threshold", "period", "position"];

export function diffSnapshots(before: ZoneSnapshot, after: ZoneSnapshot): SnapshotDiff {
  const b = new Map(before.rules.map(r => [r.id, r]));
  const a = new Map(after.rules.map(r => [r.id, r]));

  const added:   RuleSnapshot[] = [];
  const removed: RuleSnapshot[] = [];
  const changed: SnapshotDiff["changed"] = [];
  let unchanged = 0;

  for (const [id, ar] of a) {
    const br = b.get(id);
    if (!br) { added.push(ar); continue; }
    const fields = COMPARED_FIELDS.filter(f => br[f] !== ar[f]).map(String);
    if (fields.length > 0) changed.push({ before: br, after: ar, fields });
    else unchanged += 1;
  }
  for (const [id, br] of b) if (!a.has(id)) removed.push(br);

  return { added, removed, changed, unchanged };
}

export type DiffVerdict = { pass: true } | { pass: false; problems: string[] };

/**
 * 승인한 것 말고 뭔가 달라졌으면 실패다.
 *
 * "새 규칙 1개 추가" 를 승인했는데 기존 규칙 하나가 함께 바뀌었다면, 그건
 * 성공에 딸려 온 부작용이 아니라 우리가 이해하지 못한 변경이다.
 */
export function verifyDiffAgainstApproval(
  diff: SnapshotDiff,
  approval: { operation: WriteOperation; ruleRef: string },
): DiffVerdict {
  const problems: string[] = [];

  if (approval.operation === "create-rule") {
    if (diff.added.length !== 1) problems.push(`신규 규칙이 ${diff.added.length}개다 (1개여야 한다)`);
    else if (diff.added[0]!.name !== approval.ruleRef) {
      problems.push(`신규 규칙 이름이 승인과 다르다`);
    }
    if (diff.removed.length !== 0) problems.push(`규칙 ${diff.removed.length}개가 사라졌다`);
    if (diff.changed.length !== 0) problems.push(`기존 규칙 ${diff.changed.length}개가 바뀌었다`);
  }

  if (approval.operation === "update-rule") {
    if (diff.added.length !== 0)   problems.push(`규칙 ${diff.added.length}개가 새로 생겼다`);
    if (diff.removed.length !== 0) problems.push(`규칙 ${diff.removed.length}개가 사라졌다`);
    if (diff.changed.length !== 1) problems.push(`바뀐 규칙이 ${diff.changed.length}개다 (1개여야 한다)`);
    else if (diff.changed[0]!.after.id !== approval.ruleRef &&
             diff.changed[0]!.after.name !== approval.ruleRef) {
      problems.push(`바뀐 규칙이 승인 대상이 아니다`);
    }
  }

  if (approval.operation === "delete-rule") {
    if (diff.added.length !== 0)   problems.push(`규칙 ${diff.added.length}개가 새로 생겼다`);
    if (diff.changed.length !== 0) problems.push(`기존 규칙 ${diff.changed.length}개가 바뀌었다`);
    if (diff.removed.length !== 1) problems.push(`사라진 규칙이 ${diff.removed.length}개다 (1개여야 한다)`);
    else if (diff.removed[0]!.id !== approval.ruleRef &&
             diff.removed[0]!.name !== approval.ruleRef) {
      problems.push(`사라진 규칙이 승인 대상이 아니다`);
    }
  }

  return problems.length === 0 ? { pass: true } : { pass: false, problems };
}

// ── 이 도구가 하지 않는 것 ───────────────────────────────────────────────────
//
// 토큰이 기술적으로 더 많은 것을 허용해도 도구가 거부한다.

export const FORBIDDEN_OPERATIONS = Object.freeze([
  "dns", "domain-delete", "custom-domain", "pages-project-delete", "pages-deploy",
  "environment-variable", "secret", "worker-delete", "account-member",
  "billing", "plan-change", "token-create", "token-delete", "token-rotate",
  "other-zone",
] as const);

export function isForbiddenOperation(op: string): boolean {
  return (FORBIDDEN_OPERATIONS as readonly string[]).includes(op.trim().toLowerCase());
}
