#!/usr/bin/env python3
"""Finite isolated MySQL8 drill. Accept generated admin credentials as JSON on stdin only.
Does not start a DB, read .env, persist credentials, drop databases/accounts, or upload.
Parent/operator creates the dedicated instance; the source must be civicpath_test_RANDOM.
"""
import argparse
from contextlib import ExitStack
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
from types import SimpleNamespace
import backup_restore as br
from memory_credentials import client_credentials, mysql_config

def schema_fingerprint(client, database, table):
    br.require(bool(br.SAFE_ID.fullmatch(database)) and bool(br.SAFE_ID.fullmatch(table)), 'Unsafe schema identifiers')
    # MySQL SHOW CREATE formatting can change after dump/import even when column
    # character sets and collations are identical. Compare semantic metadata,
    # including defaults, generated expressions, indexes, FK rules and CHECKs.
    scope = f"TABLE_SCHEMA='{database}' AND TABLE_NAME='{table}'"
    statements = [
        f"SELECT JSON_ARRAY('table',ENGINE,TABLE_COLLATION,ROW_FORMAT,CREATE_OPTIONS,TABLE_COMMENT,AUTO_INCREMENT) FROM information_schema.TABLES WHERE {scope};",
        f"SELECT JSON_ARRAY('column',ORDINAL_POSITION,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA,CHARACTER_SET_NAME,COLLATION_NAME,GENERATION_EXPRESSION,COLUMN_COMMENT) FROM information_schema.COLUMNS WHERE {scope} ORDER BY ORDINAL_POSITION;",
        f"SELECT JSON_ARRAY('index',INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,SUB_PART,COLLATION,INDEX_TYPE,IS_VISIBLE,EXPRESSION,INDEX_COMMENT) FROM information_schema.STATISTICS WHERE {scope} ORDER BY INDEX_NAME,SEQ_IN_INDEX;",
        f"SELECT JSON_ARRAY('key',CONSTRAINT_NAME,ORDINAL_POSITION,COLUMN_NAME,CASE WHEN REFERENCED_TABLE_SCHEMA='{database}' THEN 'SELF' ELSE REFERENCED_TABLE_SCHEMA END,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,POSITION_IN_UNIQUE_CONSTRAINT) FROM information_schema.KEY_COLUMN_USAGE WHERE {scope} ORDER BY CONSTRAINT_NAME,ORDINAL_POSITION;",
        f"SELECT JSON_ARRAY('foreign',CONSTRAINT_NAME,UNIQUE_CONSTRAINT_NAME,MATCH_OPTION,UPDATE_RULE,DELETE_RULE,CASE WHEN UNIQUE_CONSTRAINT_SCHEMA='{database}' THEN 'SELF' ELSE UNIQUE_CONSTRAINT_SCHEMA END,REFERENCED_TABLE_NAME) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='{database}' AND TABLE_NAME='{table}' ORDER BY CONSTRAINT_NAME;",
        f"SELECT JSON_ARRAY('constraint',c.CONSTRAINT_NAME,c.CONSTRAINT_TYPE,c.ENFORCED,k.CHECK_CLAUSE) FROM information_schema.TABLE_CONSTRAINTS c LEFT JOIN information_schema.CHECK_CONSTRAINTS k ON k.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME=c.CONSTRAINT_NAME WHERE c.TABLE_SCHEMA='{database}' AND c.TABLE_NAME='{table}' ORDER BY c.CONSTRAINT_NAME;",
    ]
    metadata = [json.loads(line) for line in br.run(client, input=''.join(statements).encode()).decode().splitlines()]
    br.require(bool(metadata), 'Schema metadata unavailable')
    return hashlib.sha256(json.dumps(metadata, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def fingerprint(client, name):
    require = br.require
    tables = br.run(client, input=f"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='{name}' ORDER BY TABLE_NAME;".encode()).decode().splitlines()
    require(tables, 'Source is empty')
    records = []
    for table in tables:
        require(bool(br.SAFE_ID.fullmatch(table)), 'Unsafe table name')
        rows = br.run(client, input=f'SELECT COUNT(*) FROM `{name}`.`{table}`; CHECKSUM TABLE `{name}`.`{table}` EXTENDED;'.encode()).decode().splitlines()
        require(len(rows) == 2 and rows[0].isdigit(), 'Count verification failed')
        checksum = rows[1].split('\t')[-1]; require(checksum.isdigit(), 'MySQL extended table checksum unavailable')
        records.append({'table': table, 'rows': int(rows[0]), 'checksum': checksum,
                        'schemaSha256': schema_fingerprint(client, name, table)})
    return records

def main():
    os.umask(0o077)
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--port', type=int, required=True)
    cli.add_argument('--acknowledge-isolated-instance', action='store_true', required=True)
    cli.add_argument('--output-dir', required=True)
    cli.add_argument('--timeout', type=int, default=900)
    args = cli.parse_args()
    try:
        br.require(1024 <= args.port <= 65535 and args.port != 3306 and 10 <= args.timeout <= 3600, 'Dedicated non-default port required')
        raw = sys.stdin.read(8193); br.require(len(raw) <= 8192, 'Credential input too large')
        data = json.loads(raw)
        br.require(set(data) == {'user', 'password', 'sourceDatabase'}, 'Expected generated user/password/sourceDatabase on stdin')
        source = data['sourceDatabase']; br.require(bool(re.fullmatch(r'civicpath_test_[a-f0-9]{6,32}', source)), 'Only a fresh civicpath_test_RANDOM source is permitted')
        config = mysql_config(data['user'], data['password'], '127.0.0.1', args.port)
        root = br.private_dir(args.output_dir, create=True)
        marker = root / 'isolated-instance.marker'
        if not marker.exists():
            marker.write_text('CIVICPATH_ISOLATED_RESTORE_INSTANCE\n'); os.chmod(marker, 0o600)
        with ExitStack() as stack:
            config_path, _ = stack.enter_context(client_credentials(config))
            passphrase_path, _ = stack.enter_context(client_credentials(secrets.token_hex(32) + '\n'))
            source_client = br.mysql(config_path, host='127.0.0.1', port=args.port)
            before = fingerprint(source_client, source)
            result = br.backup(SimpleNamespace(acknowledge_source_read=True, db_name=source, client_config=config_path,
                                               passphrase_file=passphrase_path, output_dir=root / 'backups', timeout=args.timeout))
            bundle = root / 'backups' / result['bundleId']
            restored = br.restore(SimpleNamespace(acknowledge_isolated_instance=True, host='127.0.0.1', port=args.port,
                                    isolation_marker=marker, target_db=None, admin_config=config_path, passphrase_file=passphrase_path,
                                    bundle=bundle, rehearsal_dir=root / 'rehearsals', timeout=args.timeout, max_sql_bytes=br.MAX_SQL))
            target = restored['targetDatabase']
            after = fingerprint(source_client, target)
            unchanged = fingerprint(source_client, source)
            br.require(before == unchanged, 'Source changed during finite drill; evidence is not accepted')
            br.require(before == after, 'Schema/data count/extended checksum mismatch')
            report = {'operation': 'mysql_roundtrip_drill', 'status': 'verified_isolated_roundtrip', 'databaseCount': 2,
                      'tableCount': len(before), 'rowCount': sum(item['rows'] for item in before),
                      'schemaDataSha256': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest(),
                      'verification': ['source_unchanged', 'table_schema_equal', 'row_counts_equal', 'extended_checksums_equal', 'encrypted_manifest_verified'],
                      'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'production': 'not_touched', 'offHost': 'not_tested',
                      'sourceDatabase': source, 'targetDatabase': target, 'credentialsPersisted': False,
                      'cleanup': 'isolated source/target/account retained; encrypted backup drill key intentionally discarded'}
            br.write_json(root / ('roundtrip-' + secrets.token_hex(6) + '.json'), report)
            print(json.dumps(report, sort_keys=True))
        return 0
    except (br.SafetyError, OSError, ValueError, EOFError, UnicodeError):
        print(json.dumps({'status': 'failed_closed', 'operation': 'mysql_roundtrip_drill', 'reason': 'Isolation, command, SQL allowlist, encryption or roundtrip assertion failed; no production restore supported'}), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
