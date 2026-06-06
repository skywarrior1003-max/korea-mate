// static export 모드에서는 서버사이드 API 비활성화
// 이미지는 page.tsx BUSAN_SPOTS 상수에 직접 하드코딩되어 있어 이 엔드포인트 불필요
export const dynamic = "force-static";

export async function GET() {
  return new Response(JSON.stringify({ imageUrl: null }), {
    headers: { "Content-Type": "application/json" },
  });
}
