/**
 * Environment names.
 *
 * `MODEL`, `API_KEY`, `BASE_URL` and `PORT` are names three other tools on the
 * same machine also picked. A shell that exported one of them for something
 * else would quietly re-point the workshop at the wrong endpoint — or, worse,
 * at the right endpoint with the wrong key. So everything this process reads is
 * prefixed, and the prefixed name always wins.
 *
 * The bare name stays as a fallback, so a `.env` written for any other
 * OpenAI-compatible tool still works when it is the only thing there.
 */
export function env(name: string): string | undefined {
  return process.env[`NOMOTHETE_${name}`] ?? process.env[name]
}
