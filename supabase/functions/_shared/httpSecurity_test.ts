// Run from the repo root:
//   npx deno test --no-config --unstable-sloppy-imports supabase/functions/_shared/httpSecurity_test.ts
import { MAX_BODY_BYTES, readJsonBody } from "./httpSecurity";

// The editor tsconfig only declares a minimal Deno shim without the test API.
const denoTest = (Deno as unknown as {
  test(name: string, fn: () => Promise<void>): void;
});
const test = (name: string, fn: () => Promise<void>) => denoTest.test(name, fn);

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function checkJson(actual: unknown, expected: unknown, label = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${label} expected ${e}, got ${a}`);
}

function postWithStream(body: ReadableStream<Uint8Array>): Request {
  return new Request("https://example.test/fn", {
    method: "POST",
    body,
    // Required by fetch for streaming request bodies.
    duplex: "half",
  } as RequestInit);
}

test("accepts a small JSON object", async () => {
  const req = new Request("https://example.test/fn", {
    method: "POST",
    body: JSON.stringify({ user_id: "abc", reason: "spam" }),
  });
  checkJson(await readJsonBody(req), { user_id: "abc", reason: "spam" });
});

test("treats an empty body as an empty object", async () => {
  const req = new Request("https://example.test/fn", { method: "POST" });
  checkJson(await readJsonBody(req), {});
});

test("rejects invalid JSON and non-object JSON", async () => {
  for (const body of ["{not json", "[1,2]", "null", "42"]) {
    const req = new Request("https://example.test/fn", { method: "POST", body });
    checkJson(await readJsonBody(req), null, body);
  }
});

test("accepts a body just under the cap", async () => {
  const body = JSON.stringify({ reason: "a".repeat(MAX_BODY_BYTES - 20) });
  const req = new Request("https://example.test/fn", { method: "POST", body });
  const parsed = await readJsonBody<{ reason: string }>(req);
  check(parsed?.reason.length === MAX_BODY_BYTES - 20, "near-cap body should parse");
});

test("rejects an oversized declared content-length", async () => {
  const req = new Request("https://example.test/fn", {
    method: "POST",
    body: "{}",
    headers: { "content-length": String(MAX_BODY_BYTES + 1) },
  });
  checkJson(await readJsonBody(req), null);
});

test("counts bytes, not characters, against the cap", async () => {
  // 3000 x "€" is 3000 characters but 9000 UTF-8 bytes, over the 8192-byte cap.
  const body = JSON.stringify({ reason: "€".repeat(3000) });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  checkJson(await readJsonBody(postWithStream(stream)), null);
});

test("stops reading a body with no content-length once it passes the cap", async () => {
  let chunksPulled = 0;
  let cancelled = false;
  const chunk = new Uint8Array(1024).fill(0x20); // 1 KB of spaces
  const totalChunks = 2048; // 2 MB streamed with no content-length header
  const big = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksPulled += 1;
      if (chunksPulled > totalChunks) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });

  checkJson(await readJsonBody(postWithStream(big)), null);
  check(cancelled, "stream should be cancelled once the cap is passed");
  // Cap is 8 KB; allow some read-ahead buffering but nowhere near the full 2 MB.
  check(chunksPulled < 64, `pulled ${chunksPulled} of ${totalChunks} chunks`);
});
