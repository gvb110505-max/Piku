export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** 클라이언트가 분기할 수 있도록 오류는 항상 { error: 코드 } 형태로 */
export function fail(status: number, error: string): Response {
  return json({ error }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`환경변수 ${name} 가 설정되지 않았습니다`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}
