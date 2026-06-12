/**
 * Health check do app web. Útil para o healthcheck do container (T-008/T-009).
 */
export function GET(): Response {
  return Response.json({ status: 'ok', service: 'naabsa-web' });
}
