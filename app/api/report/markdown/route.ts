import { collectSnapshot } from '@/app/api/snapshot/route';
import { snapshotToMarkdown } from '@/lib/report';

export async function GET() {
  const snapshot = await collectSnapshot();
  return new Response(snapshotToMarkdown(snapshot), {
    headers: {
      'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
      'Content-Disposition': `inline; filename="sol-pulse-${snapshot.generatedAt.slice(0, 10)}.md"`,
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
