// Injection keeps migration rerun tests independent of a database or config.
export async function applyFundingLifecycleSchema(query, DataTypes) {
  const known = await query.showAllTables();
  const tables = new Set(known.map((value) => typeof value === 'string' ? value : value.tableName || value.name));
  const table = 'funding_lifecycle_records';
  if (!tables.has(table)) {
    await query.createTable(table, {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      organization_id: { type: DataTypes.UUID, allowNull: false },
      entity_type: { type: DataTypes.STRING(16), allowNull: false },
      entity_id: { type: DataTypes.UUID, allowNull: false },
      version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      archived_at: { type: DataTypes.DATE, allowNull: true },
      provenance: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'legacy_unverified' },
      source_url: { type: DataTypes.STRING(1000), allowNull: true },
      evidence_ids: { type: DataTypes.JSON, allowNull: false },
      work_item_ids: { type: DataTypes.JSON, allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
  }
  const indexes = [
    [table, 'funding_lifecycle_entity_unique', ['organization_id', 'entity_type', 'entity_id'], true],
    [table, 'funding_lifecycle_archive', ['organization_id', 'entity_type', 'archived_at']],
    ['Grant', 'grant_funding_org_created', ['organization_id', 'created_at', 'id']],
    ['FundingPathway', 'pathway_funding_org_created', ['organization_id', 'created_at', 'id']],
    ['EvidenceItem', 'evidence_funding_org_grant', ['organization_id', 'grant_id']],
    ['WorkItem', 'work_funding_org_grant', ['organization_id', 'grant_id']],
  ];
  for (const [target, name, fields, unique = false] of indexes) {
    if (target !== table && !tables.has(target)) continue;
    const existing = await query.showIndex(target);
    if (!existing.some((index) => index.name === name)) await query.addIndex(target, fields, { name, unique });
  }
}
