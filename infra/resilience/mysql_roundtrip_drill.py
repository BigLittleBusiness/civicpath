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

def fingerprint(client, name):
    require = br.require
    tables = br.run(client, input=f"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='{name}' ORDER BY TABLE_NAME;".encode()).decode().splitlines()
    require(tables, 'Source is empty')
    records = []
    for table in tables:
        require(bool(br.SAFE_ID.fullmatch(table)), 'Unsafe table name')
        rows = br.run(client, input=f'SELECT COUNT(*) FROM `{name}`.`{table}`; CHECKSUM TABLE `{name}`.`{table}` EXTENDED; SHOW CREATE TABLE `{name}`.`{table}`;'.encode()).decode().splitlines()
        require(len(rows) >= 3 and rows[0].isdigit(), 'Count verification failed')
        checksum = rows[1].split('\t')[-1]; require(checksum.isdigit(), 'MySQL extended table checksum unavailable')
        records.append({'table': table, 'rows': int(rows[0]), 'checksum': checksum,
                        'schemaSha256': hashlib.sha256('\n'.join(rows[2:]).encode()).hexdigest()})
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
