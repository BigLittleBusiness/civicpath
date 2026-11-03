export function createHealthController(service) {
  const send = (res, code, data) => res.set('Cache-Control', 'no-store').status(code).json({ data });
  return Object.freeze({
    live(_req, res) { return send(res, 200, service.liveness()); },
    async ready(_req, res) {
      try {
        const data = await service.readiness();
        return send(res, data.status === 'ready' ? 200 : 503, data);
      } catch {
        return send(res, 503, { service: 'civicpath-api', status: 'unready', checks: { database: 'unready', backgroundJobs: 'unready' } });
      }
    },
  });
}
