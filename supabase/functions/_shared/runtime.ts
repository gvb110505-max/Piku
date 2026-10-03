declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** 응답을 먼저 돌려주고 남은 작업(푸시 등)을 계속 실행. Supabase Edge Runtime 이 아니면 그냥 기다린다. */
export async function background(task: Promise<unknown>): Promise<void> {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(task.catch((e) => console.error('background task failed', e)));
    return;
  }
  await task.catch((e) => console.error('background task failed', e));
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
