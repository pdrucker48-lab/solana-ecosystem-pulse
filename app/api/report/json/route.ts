import { collectSnapshot } from '@/app/api/snapshot/route';

export async function GET() {
  const snapshot = await collectSnapshot();
  return new Response(JSON.stringify(snapshot, null, 2), {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      'Content-Disposition': `inline; filename="sol-pulse-${snapshot.generatedAt.slice(0, 10)}.json"`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
