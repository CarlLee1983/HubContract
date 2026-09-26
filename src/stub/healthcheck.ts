/**
 * docker-compose.yml's mock-provider healthcheck. A separate tiny script
 * (rather than `curl`) because the oven/bun image doesn't ship curl.
 */
const port = process.env.STUB_PORT ?? "8081";
const res = await fetch(`http://localhost:${port}/__stub/health`);
if (!res.ok) {
  process.exit(1);
}
