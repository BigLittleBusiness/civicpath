import { createTenantLifecycleService } from '../services/tenantLifecycleService.mjs';
import { tenantLifecycleRepository } from '../services/tenantLifecycleRepository.js';
import { encryptConfiguration, decryptConfiguration } from '../services/encryption.js';
import { LifecycleError } from '../services/tenantLifecyclePolicy.mjs';

export const tenantLifecycleService = createTenantLifecycleService({ repository: tenantLifecycleRepository, encrypt: encryptConfiguration, decrypt: decryptConfiguration });
export function createTenantLifecycleController(service = tenantLifecycleService) {
  const handler = (operation, { created = false, download = false, platform = false } = {}) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const organizationId = platform ? req.params.organizationId : req.auth?.organizationId;
      const result = await operation(service, req, organizationId);
      if (download) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.status(200).send(result.serialized);
      }
      return res.status(created ? 201 : 200).json({ data: result });
    } catch (error) {
      if (error instanceof LifecycleError) return res.status(error.status).json({ error: error.code.replace(/_/g, ' '), code: error.code });
      // No DB driver diagnostics, payloads, credentials or stack traces leave this router.
      return res.status(503).json({ error: 'Tenant data controls are temporarily unavailable. Please retry or contact your platform administrator.', code: 'lifecycle_unavailable' });
    }
  };
  return {
    status: handler((s, req, org) => s.status(req.auth, org)),
    request: handler((s, req, org) => s.request(req.auth, org, req.body), { created: true }),
    attachmentRequest: handler((s, req, org) => s.attachmentRequest(req.auth, org, req.body), { created: true }),
    createExport: handler((s, req, org) => s.createExport(req.auth, org, req.body), { created: true }),
    exportStatus: handler((s, req, org) => s.exportStatus(req.auth, org, req.params.exportId)),
    download: handler((s, req, org) => s.download(req.auth, org, req.params.exportId), { download: true }),
    platformStatus: handler((s, req, org) => s.platformStatus(req.auth, org), { platform: true }),
    review: handler((s, req, org) => s.review(req.auth, org, req.params.requestId, req.body), { platform: true }),
  };
}
export const tenantLifecycleController = createTenantLifecycleController();
