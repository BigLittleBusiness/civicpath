import crypto from 'node:crypto';
import { EXPORT_LIMITS, LIFECYCLE_POLICY, LifecycleError, authorizeActor, boundedText, collectTenantGraph, reviewTransition, validId, validateBody } from './tenantLifecyclePolicy.mjs';

export function createTenantLifecycleService({ repository: repo, encrypt, decrypt, limits = EXPORT_LIMITS, now = Date.now }) {
  let concurrent = 0;
  const audit = (context, transaction, action, entityId, metadata = {}) => repo.audit({ organizationId: context.organization.id, userId: context.user.id, action, entityId, metadata, transaction });
  async function context(auth, organizationId, capability, transaction) {
    validId(organizationId); const user = await repo.user(auth?.sub, transaction);
    const organization = await repo.organization(organizationId, transaction);
    authorizeActor(auth, user, organization, capability);
    return { user, organization };
  }
  async function locked(auth, organizationId, capability, work) {
    return repo.transaction(async (transaction) => {
      const ctx = await context(auth, organizationId, capability, transaction);
      // A locked organization row is the serialization point for requests, holds, reviews and export slots.
      const state = await repo.state(organizationId, transaction);
      return work(ctx, state, transaction);
    });
  }
  return {
    async status(auth, organizationId) {
      return locked(auth, organizationId, 'read', async (ctx, state, tx) => {
        await repo.expireArtifacts(organizationId, now(), tx);
        const requests = await repo.listRequests(organizationId, tx, 50);
        const exports = ctx.user.role === 'org_admin' ? await repo.listExports(organizationId, tx, 10) : [];
        const attachments = ctx.user.role === 'org_admin' ? await repo.listAttachmentRequests(organizationId, tx, 20) : [];
        await audit(ctx, tx, 'lifecycle_status_viewed', ctx.organization.id);
        return { policy: LIFECYCLE_POLICY, holdActive: !!state.holdActive, requests, exports, attachmentRequests: attachments,
          limits: { maxRows: limits.maxRows, maxBytes: limits.maxBytes, artifactMinutes: limits.artifactTtlMilliseconds / 60000 },
          capabilities: { canExport: ctx.user.role === 'org_admin', canRequest: ctx.user.role === 'org_admin', canExecute: false },
          boundedHistory: { requests: 50, exports: 10, attachmentRequests: 20 } };
      });
    },
    async request(auth, organizationId, body) {
      validateBody(body, ['kind', 'reason']);
      if (!['closure', 'retention', 'legal_hold', 'release_hold'].includes(body.kind)) throw new LifecycleError('invalid_request_kind');
      const reason = boundedText(body.reason);
      return locked(auth, organizationId, 'write', async (ctx, state, tx) => {
        if (body.kind === 'closure' && state.holdActive) throw new LifecycleError('legal_hold_blocks_closure', 409);
        if (body.kind === 'release_hold' && !state.holdActive) throw new LifecycleError('no_active_hold', 409);
        if (await repo.pendingRequest(organizationId, body.kind, tx)) throw new LifecycleError('request_already_pending', 409);
        if (await repo.requestCount(organizationId, new Date(now() - 3600000), tx) >= 10) throw new LifecycleError('request_rate_limit', 429);
        const record = await repo.createRequest({ organizationId, kind: body.kind, reason, requestedBy: ctx.user.id, status: 'pending' }, tx);
        // Precautionary preservation begins immediately; only independent verified platform approval can lift it.
        if (body.kind === 'legal_hold') await repo.setHold(state, true, tx);
        await audit(ctx, tx, 'lifecycle_request_created', record.id, { kind: body.kind, precautionaryHold: body.kind === 'legal_hold' });
        return record;
      });
    },
    async platformStatus(auth, organizationId) {
      return locked(auth, organizationId, 'platform_review', async (ctx, state, tx) => {
        await audit(ctx, tx, 'lifecycle_platform_review_viewed', organizationId);
        return { organization: { id: organizationId, name: ctx.organization.name, status: ctx.organization.status }, policy: LIFECYCLE_POLICY,
          holdActive: !!state.holdActive, requests: await repo.listRequests(organizationId, tx, 50), attachmentRequests: await repo.listAttachmentRequests(organizationId, tx, 20) };
      });
    },
    async review(auth, organizationId, requestId, body) {
      validId(requestId);
      return locked(auth, organizationId, 'platform_review', async (ctx, state, tx) => {
        const record = await repo.getRequest(organizationId, requestId, tx);
        if (!record) throw new LifecycleError('request_not_found', 404);
        const changes = reviewTransition(record, body, ctx.user.id, state.holdActive);
        await repo.updateRequest(record, { ...changes, reviewedAt: new Date(now()) }, tx);
        if (changes.status === 'approved' && record.kind === 'release_hold') {
          if (await repo.hasPendingHold(organizationId, tx)) throw new LifecycleError('pending_hold_blocks_release', 409);
          await repo.setHold(state, false, tx);
        }
        if (changes.status === 'approved' && record.kind === 'legal_hold') await repo.setHold(state, true, tx);
        if (changes.status === 'access_closed_data_preserved') await repo.closeAccess(ctx.organization, state, now(), tx);
        // Rejection of a hold request never silently removes precautionary preservation.
        await audit(ctx, tx, 'lifecycle_request_reviewed', record.id, { kind: record.kind, decision: body.decision, status: changes.status, humanVerified: changes.humanVerified === true });
        return record;
      });
    },
    async attachmentRequest(auth, organizationId, body) {
      validateBody(body, ['kind', 'attachmentId']); validId(body.attachmentId);
      if (!['support', 'evidence'].includes(body.kind)) throw new LifecycleError('invalid_attachment_kind');
      return locked(auth, organizationId, 'write', async (ctx, _state, tx) => {
        // Composite tenant + attachment + current parent scope; never delegates to the unscoped legacy admin downloader.
        if (!await repo.attachmentOwned(organizationId, body.kind, body.attachmentId, tx)) throw new LifecycleError('attachment_not_found', 404);
        const existing = await repo.pendingAttachment(organizationId, body.kind, body.attachmentId, tx);
        if (existing) return existing;
        if (await repo.attachmentRequestCount(organizationId, new Date(now() - 3600000), tx) >= 20) throw new LifecycleError('attachment_request_rate_limit', 429);
        const record = await repo.createAttachmentRequest({ organizationId, kind: body.kind, attachmentId: body.attachmentId, requestedBy: ctx.user.id, status: 'pending_private_delivery' }, tx);
        await audit(ctx, tx, 'lifecycle_attachment_requested', record.id, { kind: body.kind, attachmentId: body.attachmentId });
        return record;
      });
    },
    async createExport(auth, organizationId, body = {}) {
      validateBody(body, []);
      if (concurrent >= limits.maxConcurrentPerProcess) throw new LifecycleError('export_capacity_busy', 429);
      concurrent++; let reservation;
      try {
        reservation = await locked(auth, organizationId, 'write', async (ctx, _state, tx) => {
          await repo.expireArtifacts(organizationId, now(), tx);
          if (await repo.activeExport(organizationId, now(), tx)) throw new LifecycleError('export_already_building', 409);
          if (await repo.exportCount(organizationId, new Date(now() - 3600000), tx) >= limits.maxRequestsPerHour) throw new LifecycleError('export_rate_limit', 429);
          if (await repo.readyExportCount(organizationId, now(), tx) >= limits.maxReadyPerTenant) throw new LifecycleError('export_artifact_capacity', 429);
          const record = await repo.createExport({ organizationId, requestedBy: ctx.user.id, status: 'building', leaseUntil: new Date(now() + limits.leaseMilliseconds), expiresAt: new Date(now() + limits.artifactTtlMilliseconds) }, tx);
          await audit(ctx, tx, 'workspace_export_requested', record.id);
          return record;
        });
        // Separate bounded consistent read snapshot, no organization lock held during graph traversal.
        const collected = await repo.snapshot((tx) => collectTenantGraph({ repository: repo, organizationId, transaction: tx, limits, now }));
        const encryptedPayload = JSON.stringify(await encrypt(collected.document));
        const checksumSha256 = crypto.createHash('sha256').update(collected.serialized).digest('hex');
        return await locked(auth, organizationId, 'write', async (ctx, _state, tx) => {
          const record = await repo.getExport(organizationId, reservation.id, tx);
          if (!record || record.status !== 'building' || new Date(record.leaseUntil).getTime() <= now()) throw new LifecycleError('export_lease_expired', 409);
          await repo.updateExport(record, { status: 'ready', encryptedPayload, checksumSha256, rowCount: collected.totalRows, byteCount: collected.byteCount }, tx);
          await audit(ctx, tx, 'workspace_export_ready', record.id, { rowCount: collected.totalRows, byteCount: collected.byteCount, checksumSha256 });
          return repo.exportSummary(record, now());
        });
      } catch (error) {
        if (reservation) await repo.transaction(async (tx) => {
          const record = await repo.getExport(organizationId, reservation.id, tx);
          if (record?.status === 'building') {
            const errorCode = error instanceof LifecycleError ? error.code : 'export_failed';
            await repo.updateExport(record, { status: 'failed', errorCode, encryptedPayload: null }, tx);
            await repo.audit({ organizationId, userId: reservation.requestedBy, action: 'workspace_export_failed', entityId: reservation.id, metadata: { errorCode }, transaction: tx });
          }
        });
        throw error;
      } finally { concurrent--; }
    },
    async exportStatus(auth, organizationId, exportId) {
      validId(exportId);
      return locked(auth, organizationId, 'write', async (ctx, _state, tx) => {
        await repo.expireArtifacts(organizationId, now(), tx);
        const record = await repo.getExport(organizationId, exportId, tx);
        if (!record) throw new LifecycleError('export_not_found', 404);
        await audit(ctx, tx, 'workspace_export_status_viewed', record.id);
        return repo.exportSummary(record, now());
      });
    },
    async download(auth, organizationId, exportId) {
      validId(exportId);
      return locked(auth, organizationId, 'write', async (ctx, _state, tx) => {
        const record = await repo.getExport(organizationId, exportId, tx);
        if (!record) throw new LifecycleError('export_not_found', 404);
        if (record.status !== 'ready' || new Date(record.expiresAt).getTime() <= now()) throw new LifecycleError('export_unavailable', 410);
        if (record.downloadCount >= 10) throw new LifecycleError('export_download_limit', 429);
        const document = await decrypt(JSON.parse(record.encryptedPayload));
        const serialized = JSON.stringify(document);
        if (document.manifest?.organizationId !== organizationId || crypto.createHash('sha256').update(serialized).digest('hex') !== record.checksumSha256) throw new LifecycleError('export_integrity_failed', 409);
        await repo.updateExport(record, { downloadCount: record.downloadCount + 1, lastDownloadedAt: new Date(now()) }, tx);
        // This records authorization/dispatch, not an unverifiable assertion of browser receipt.
        await audit(ctx, tx, 'workspace_export_download_authorized', record.id, { checksumSha256: record.checksumSha256, byteCount: record.byteCount });
        return { serialized, filename: `civicpath-workspace-${exportId}.json` };
      });
    },
  };
}
