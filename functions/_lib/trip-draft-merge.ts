// 로그인 시 guest draft → account draft 무손실 병합 (THIS-TRIP-SYNC-V1 §5)
//
// 규칙:
//  · 한쪽만 있으면 그쪽을 쓴다.
//  · 둘 다 있으면 identity(sourceKey ?? id) 합집합 — account 항목·순서를
//    유지하고 guest 에만 있는 항목을 뒤에 붙인다(sortOrder 재부여).
//  · 서로 다른 도시의 여행은 항목의 tripCity 가 다를 뿐 같은 배열에 공존한다
//    — 어느 쪽도 폐기·혼합되지 않는다.
//  · 병합 후 guest(device) 행은 제거한다: 삭제가 아니라 계정으로의 이동이며,
//    남겨 두면 다음 병합에서 유령 부활한다. 재호출은 멱등(device 행 부재).
//  · 실패는 조용히 넘기지 않는다 — activate 가 503 으로 실패시킨다(fail closed).

interface Env { NEXT_PUBLIC_SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }

type DraftItem = Record<string, unknown> & { id?: unknown; sourceKey?: unknown; sortOrder?: unknown };

const identityOf = (it: DraftItem): string =>
  String(typeof it.sourceKey === "string" && it.sourceKey ? it.sourceKey : it.id ?? "");

async function rest(env: Env, method: string, pathQ: string, body?: unknown, prefer?: string) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${pathQ}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json", ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, data };
}

/** 무손실 합집합 — account 우선 순서, guest 신규만 뒤에 추가 */
export function mergeDraftItems(account: DraftItem[], guest: DraftItem[]): DraftItem[] {
  const seen = new Set(account.map(identityOf).filter(Boolean));
  const merged = [...account];
  let nextOrder = merged.reduce((m, it) => Math.max(m, Number(it.sortOrder) || 0), 0);
  for (const g of guest) {
    const key = identityOf(g);
    if (key && seen.has(key)) continue; // 동일 identity — 중복 없이 유지(§5-2)
    if (key) seen.add(key);
    nextOrder += 1;
    merged.push({ ...g, sortOrder: nextOrder });
  }
  return merged;
}

/**
 * activate 전용 — link 성공 직후 1회 호출. guest device 행을 user 행으로
 * 흡수하고 device 행을 제거한다. 성공/할 일 없음 true, 판정·쓰기 장애 false.
 */
export async function mergeGuestDraftIntoAccount(env: Env, userId: string, deviceId: string): Promise<boolean> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
  // DURABILITY-V1 §4.4 — 병합도 DB 원자 RPC(row FOR UPDATE) 하나로.
  // 합집합 규칙은 mergeDraftItems 와 동일(SQL 미러) — account 순서 유지·
  // guest 신규만 뒤에·중복 0·guest 행 제거(멱등). revision 도 서버가 올린다.
  const r = await rest(env, "POST", "rpc/trip_draft_merge_guest",
    { p_user: userId, p_device: deviceId });
  return r.ok && Array.isArray(r.data);
}
