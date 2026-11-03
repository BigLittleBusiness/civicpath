#!/usr/bin/env python3
"""Finite, standard-library-only MySQL backup/rehearsal tooling. Never restores production.
Credentials are supplied in private operator-managed files, never argv or output.
No environment templates, production provisioning, schedules or deletion commands.
"""
import argparse
import base64
import datetime as dt
import gzip
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
from memory_credentials import ACTIVE_FDS, client_credentials, mysql_config

FORMAT = 'civicpath-mysql-encrypted-v2'
MAX_MANIFEST = 1024 * 1024
MAX_SQL = 20 * 1024 ** 3
SAFE_ID = re.compile(r'^[A-Za-z][A-Za-z0-9_]{0,63}$')
RESTORE_ID = re.compile(r'^cp_restore_[0-9]{8}_[a-f0-9]{12}$')
class SafetyError(Exception):
    pass

def require(condition, message):
    if not condition:
        raise SafetyError(message)

def private_file(value):
    path = Path(value).absolute()
    if re.fullmatch(r'/proc/self/fd/[0-9]+', str(path)):
        fd = int(path.name)
        require(fd in ACTIVE_FDS, 'Only locally created anonymous credential descriptors are allowed')
        return path
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not path.is_symlink() and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0, 'Operator file must be owned, regular and mode 0600 or stricter')
    return path

def private_dir(value, create=False):
    path = Path(value).absolute()
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0, 'Directory must be owned and mode 0700 or stricter')
    return path

def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

def write_json(path, data):
    with open(path, 'x', encoding='utf8') as handle:
        json.dump(data, handle, sort_keys=True, indent=2)
        handle.write('\n')
    os.chmod(path, 0o600)

def command_env():
    # MySQL8 has no --no-login-paths flag. Its documented test login-file override
    # prevents reading the operator's ~/.mylogin.cnf even with --defaults-file.
    environment = {key: value for key, value in os.environ.items() if not key.startswith('MYSQL')}
    environment['MYSQL_TEST_LOGIN_FILE'] = '/dev/null'
    return environment

def run(argv, *, input=None, timeout=60, env=None):
    try:
        result = subprocess.run([str(arg) for arg in argv], input=input, capture_output=True,
                                timeout=timeout, env=env or command_env(), pass_fds=tuple(ACTIVE_FDS))
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SafetyError('Required command unavailable or exceeded its deadline') from error
    require(result.returncode == 0, 'Command failed; details suppressed to protect operator secrets')
    return result.stdout

def mysql(config, *, host=None, port=None, user=None, database=None):
    argv = ['mysql', f'--defaults-file={config}', '--batch', '--raw', '--skip-column-names', '--connect-timeout=5']
    if host:
        argv += [f'--host={host}', f'--port={port}', '--protocol=TCP']
    if user:
        argv += [f'--user={user}']
    if database:
        argv += [f'--database={database}']
    return argv

def inventory(client, name=None):
    if name:
        require(bool(SAFE_ID.fullmatch(name)), 'Invalid database identifier')
        where = f"TABLE_SCHEMA = '{name}'"
    else:
        where = 'TABLE_SCHEMA = DATABASE()'
    sql = f'SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE {where} ORDER BY TABLE_NAME;'
    rows = run(client, input=sql.encode(), timeout=60).decode().splitlines()
    names = []
    for row in rows:
        parts = row.split('\t')
        require(len(parts) == 2 and parts[1] == 'BASE TABLE' and bool(SAFE_ID.fullmatch(parts[0])),
                'Only ordinary tables with safe identifiers are supported by this rehearsal format')
        names.append(parts[0])
    require(names, 'Source database has no supported tables')
    digest = hashlib.sha256('\n'.join(names).encode()).hexdigest()
    return {'tableCount': len(names), 'tableInventorySha256': digest}

def cipher_base(passphrase):
    return ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-iter', '600000', '-md', 'sha256', '-pass', f'file:{passphrase}']

def authenticate(manifest, passphrase):
    require(bool(re.fullmatch('[a-f0-9]{64}', str(manifest.get('macSalt', '')))), 'Invalid authentication salt')
    # Independent salt/key for encrypt-then-MAC. Authenticate every accepted manifest field,
    # including ciphertext checksum and schema inventory, before decrypting or creating a DB.
    password = Path(passphrase).read_bytes().split(b'\n', 1)[0]
    key = hashlib.pbkdf2_hmac('sha256', password, b'civicpath-manifest-mac-v2:' + bytes.fromhex(manifest['macSalt']), 600000, 32)
    data = {key: value for key, value in manifest.items() if key != 'hmacSha256'}
    return hmac.new(key, json.dumps(data, sort_keys=True, separators=(',', ':')).encode(), hashlib.sha256).hexdigest()

def check_passphrase(path):
    # Length check only; never write the passphrase to logs, argv, manifests or generated files.
    require(path.stat().st_size >= 32 and path.stat().st_size <= 4096, 'Use a high-entropy passphrase file of 32–4096 bytes')
    first_line = path.read_bytes().split(b'\n', 1)[0]
    require(32 <= len(first_line) <= 4096 and b'\x00' not in first_line and b'\r' not in first_line,
            'The first passphrase line must contain at least 32 valid high-entropy bytes')

def backup(args):
    require(args.acknowledge_source_read, 'Source backup read approval is required')
    require(bool(SAFE_ID.fullmatch(args.db_name)), 'Invalid source database identifier')
    config = private_file(args.client_config)
    passphrase = private_file(args.passphrase_file)
    check_passphrase(passphrase)
    root = private_dir(args.output_dir, create=True)
    bundle = root / ('backup-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(6))
    bundle.mkdir(mode=0o700)
    client = mysql(config)
    before = inventory(client, args.db_name)
    # Tables must be transactional; unsupported stored code must not silently disappear.
    sql = (f"SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='{args.db_name}' AND ENGINE <> 'InnoDB';"
           f"SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='{args.db_name}';"
           f"SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='{args.db_name}';"
           f"SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='{args.db_name}';")
    require(run(client, input=sql.encode()).decode().splitlines() == ['0', '0', '0', '0'],
            'Non-InnoDB tables or stored code require a separately reviewed backup plan')
    artifact = bundle / 'database.sql.gz.enc'
    processes = []
    try:
        with tempfile.TemporaryDirectory(prefix='encryption-', dir=bundle) as home:
            os.chmod(home, 0o700)
            dump = ['mysqldump', f'--defaults-file={config}', '--single-transaction', '--quick',
                    '--hex-blob', '--skip-lock-tables', '--skip-add-locks', '--skip-add-drop-table', '--skip-add-drop-database',
                    '--skip-disable-keys', '--skip-triggers', '--skip-routines', '--skip-events', '--no-tablespaces',
                    '--set-gtid-purged=OFF', '--no-create-db', '--skip-comments', '--skip-dump-date', '--skip-extended-insert',
                    '--column-statistics=0', args.db_name]
            # Pipeline: clear SQL never reaches disk. All stderr is suppressed, never echoed.
            p1 = subprocess.Popen(dump, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=command_env(), pass_fds=tuple(ACTIVE_FDS)); processes.append(p1)
            p2 = subprocess.Popen(['gzip', '-c'], stdin=p1.stdout, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL); processes.append(p2); p1.stdout.close()
            p3 = subprocess.Popen(cipher_base(passphrase) + ['-salt', '-out', str(artifact)],
                                  stdin=p2.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, pass_fds=tuple(ACTIVE_FDS)); processes.append(p3); p2.stdout.close()
            try:
                deadline = time.monotonic() + args.timeout
                codes = [process.wait(timeout=max(0.001, deadline - time.monotonic())) for process in reversed(processes)]
            except subprocess.TimeoutExpired as error:
                raise SafetyError('Backup deadline exceeded; partial encrypted artifact retained, not accepted') from error
            require(all(code == 0 for code in codes), 'Backup pipeline failed; no accepted manifest was created')
        after = inventory(client, args.db_name)
        require(before == after, 'Schema changed during backup; no accepted manifest was created')
        os.chmod(artifact, 0o600)
        require(artifact.stat().st_size > 0, 'Empty encrypted artifact')
        manifest = {'format': FORMAT, 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'artifact': artifact.name,
                    'sizeBytes': artifact.stat().st_size, 'sha256': sha256(artifact), 'compression': 'gzip',
                    'encryption': 'AES256-CBC PBKDF2-SHA256/600000 encrypt-then-HMAC-SHA256', 'schema': before,
                    'macSalt': secrets.token_hex(32),
                    'snapshot': 'single-transaction; prohibit DDL during backup', 'offHost': 'not_verified'}
        manifest['hmacSha256'] = authenticate(manifest, passphrase)
        write_json(bundle / 'manifest.json', manifest)
        (bundle / 'manifest.sha256').write_text(sha256(bundle / 'manifest.json') + '  manifest.json\n')
        os.chmod(bundle / 'manifest.sha256', 0o600)
        return {'operation': 'backup', 'status': 'verified_local_encrypted', 'bundleId': bundle.name, 'offHost': 'not_verified'}
    finally:
        for process in processes:
            if process.poll() is None:
                process.kill()
            process.wait()

def verify_bundle(value):
    bundle = private_dir(value)
    manifest_path = private_file(bundle / 'manifest.json')
    checksum_path = private_file(bundle / 'manifest.sha256')
    require(manifest_path.stat().st_size <= MAX_MANIFEST and checksum_path.stat().st_size < 256, 'Oversize manifest')
    require(checksum_path.read_text().strip() == sha256(manifest_path) + '  manifest.json', 'Manifest checksum mismatch')
    manifest = json.loads(manifest_path.read_text())
    require(manifest.get('format') == FORMAT and manifest.get('artifact') == 'database.sql.gz.enc', 'Unsupported backup format')
    artifact = private_file(bundle / 'database.sql.gz.enc')
    require(manifest.get('sizeBytes') == artifact.stat().st_size and manifest.get('sha256') == sha256(artifact), 'Artifact checksum mismatch')
    schema = manifest.get('schema', {})
    require(isinstance(schema.get('tableCount'), int) and 0 < schema['tableCount'] <= 10000
            and bool(re.fullmatch('[a-f0-9]{64}', str(schema.get('tableInventorySha256', '')))), 'Invalid schema manifest')
    return bundle, manifest, artifact

# Strip comments/quoted values before conservative SQL command checks. Dumps with stored code,
# views, qualified identifiers or unfamiliar directives intentionally require a manual review.
def sql_statements(handle):
    state = 'plain'; quote = ''; buffer = []; index = 0
    text = handle.read(1024 * 1024)
    while text:
        incoming = handle.read(1024 * 1024)
        limit = len(text) if not incoming else max(0, len(text) - 32)
        pos = 0
        while pos < limit:
            c = text[pos]; nxt = text[pos + 1] if pos + 1 < len(text) else ''
            if state == 'quoted':
                buffer.append(' ')
                if c == '\\': state = 'escaped'
                elif c == quote: state = 'plain'
            elif state == 'escaped':
                buffer.append(' '); state = 'quoted'
            elif state == 'line':
                if c == '\n': state = 'plain'; buffer.append(' ')
            elif state == 'comment':
                if c == '*' and nxt == '/': state = 'plain'; pos += 1; buffer.append(' ')
            elif c in "'\"": state = 'quoted'; quote = c; buffer.append(' ')
            elif c == '#' or (c == '-' and nxt == '-'): state = 'line'; pos += int(c == '-')
            elif c == '/' and nxt == '*':
                # MySQL executable version comments are handled as ordinary SQL, not ignored.
                if pos + 2 < len(text) and text[pos + 2] == '!':
                    match = re.match(r'/\*!\d*\s*', text[pos:]); pos += len(match.group(0)) - 1
                else: state = 'comment'; pos += 1
            elif c == '*' and nxt == '/': pos += 1
            elif c == ';':
                stmt = ''.join(buffer).strip(); buffer = []; index += 1
                if stmt: yield stmt
            else: buffer.append(c)
            pos += 1
        # Carry token suffix across chunk boundaries; state and statement buffer are preserved.
        text = text[pos:] + incoming
        require(len(buffer) <= 64 * 1024 * 1024, 'SQL statement exceeds safe rehearsal limit')
    require(state in ('plain', 'line'), 'Unterminated SQL token')
    remainder = ''.join(buffer).strip()
    require(not remainder, 'SQL must end with a statement terminator')

def validate_sql(path):
    commands = 0
    with open(path, encoding='utf8') as handle:
        for statement in sql_statements(handle):
            commands += 1
            # Governed column identifiers such as `event` are not SQL commands.
            # Only plain safe identifiers are removed for keyword checks; command
            # structure and cross-schema/client-command checks use the original SQL.
            unquoted_commands = re.sub(r'`[A-Za-z][A-Za-z0-9_]*`', ' ', statement)
            upper = unquoted_commands.upper()
            require('\\' not in statement and '.' not in re.sub(r'\b\d+\.\d+\b', '', statement), 'Qualified schema or client commands prohibited')
            require(not re.search(r'\b(DROP|TRUNCATE|GRANT|REVOKE|DEFINER|OUTFILE|INFILE|LOAD|CALL|PREPARE|EXECUTE|GLOBAL|DATABASE|SCHEMA|FUNCTION|PROCEDURE|TRIGGER|EVENT|VIEW)\b', upper),
                    'Unsupported or destructive SQL prohibited')
            require(bool(re.match(r'^(CREATE\s+TABLE\s+`[A-Za-z][A-Za-z0-9_]*`\s*\(|INSERT\s+INTO\s+`[A-Za-z][A-Za-z0-9_]*`\s+VALUES\s*\(|SET\s)', statement, re.I)),
                    'Only table creation, literal inserts and session SET directives are accepted')
            if upper.startswith('SET'):
                require(bool(re.match(r'^SET\s+(?:NAMES\s+\w+|(?:SESSION\s+)?(?:@?[A-Z_]+|@@SESSION\.[A-Z_]+)\s*=)', upper)), 'Unexpected SET directive')
    require(commands > 0, 'Empty SQL dump')

def validate_isolation(args):
    require(args.acknowledge_isolated_instance, 'Explicit isolated-instance acknowledgement required')
    require(args.host in ('127.0.0.1', '::1') and 1024 <= args.port <= 65535 and args.port != 3306,
            'Rehearsal requires loopback TCP on a non-default port; use a dedicated isolated instance')
    marker = private_file(args.isolation_marker)
    require(marker.read_text() == 'CIVICPATH_ISOLATED_RESTORE_INSTANCE\n', 'Isolation marker is invalid')
    target = args.target_db or ('cp_restore_' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d_') + secrets.token_hex(6))
    require(bool(RESTORE_ID.fullmatch(target)), 'Only new cp_restore_DATE_RANDOM database names are allowed; production restore needs separate approval')
    return target

def restore(args):
    target = validate_isolation(args)
    config = private_file(args.admin_config); passphrase = private_file(args.passphrase_file); check_passphrase(passphrase)
    bundle, manifest, artifact = verify_bundle(args.bundle)
    require(hmac.compare_digest(str(manifest.get('hmacSha256', '')), authenticate(manifest, passphrase)), 'Authentication failed; no decryption or DB creation')
    root = private_dir(args.rehearsal_dir, create=True)
    report_dir = root / target
    report_dir.mkdir(mode=0o700)  # Fail closed on reused rehearsal name, before any database commands.
    client = mysql(config, host=args.host, port=args.port)
    exists_sql = f"SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{target}';"
    require(run(client, input=exists_sql.encode()).decode().strip() == '0', 'Target already exists; no reuse or destruction allowed')
    with tempfile.TemporaryDirectory(prefix='restore-private-', dir=report_dir) as temp:
        os.chmod(temp, 0o700); temp = Path(temp)
        compressed = temp / 'database.sql.gz'; sql = temp / 'database.sql'
        run(cipher_base(passphrase) + ['-d', '-in', artifact, '-out', compressed], timeout=args.timeout)
        total = 0
        with gzip.open(compressed, 'rb') as source, open(sql, 'xb') as out:
            os.chmod(sql, 0o600)
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                total += len(chunk); require(total <= args.max_sql_bytes, 'Expanded dump exceeds rehearsal disk limit'); out.write(chunk)
        validate_sql(sql)
        # A dedicated account receives privileges only on the newly created target, preventing
        # even a reviewed SQL dump from modifying any other database or server account.
        user = 'cp_drill_' + secrets.token_hex(8); password = secrets.token_hex(32)
        create_sql = (f'CREATE DATABASE `{target}` CHARACTER SET utf8mb4;'
                      f"CREATE USER '{user}'@'%' IDENTIFIED BY '{password}';"
                      f"GRANT SELECT, INSERT, CREATE, INDEX, REFERENCES ON `{target}`.* TO '{user}'@'%';")
        run(client, input=create_sql.encode(), timeout=60)
        with client_credentials(mysql_config(user, password, args.host, args.port)) as (user_config, _fd):
            scoped = mysql(user_config, host=args.host, port=args.port, user=user, database=target)
            # Never --force: the first SQL error fails the rehearsal. Partial isolated DB is retained.
            try:
                with open(sql, 'rb') as handle:
                    result = subprocess.run(scoped, stdin=handle, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                            timeout=args.timeout, env=command_env(), pass_fds=tuple(ACTIVE_FDS))
                require(result.returncode == 0, 'Import failed; isolated target retained, no production touched')
            except subprocess.TimeoutExpired as error:
                raise SafetyError('Import deadline exceeded; isolated target retained') from error
            actual = inventory(scoped)
            require(actual == manifest['schema'], 'Restored table inventory does not match the accepted manifest')
            require(run(scoped, input=b'SELECT 1;').decode().strip() == '1', 'Restored database query failed')
        report = {'operation': 'restore_rehearsal', 'status': 'verified_isolated_database', 'targetDatabase': target,
                  'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'artifactSha256': manifest['sha256'],
                  'schema': actual, 'destructiveOperations': False, 'productionRestore': 'approval_required',
                  'limitations': ['No application/tenant smoke performed', 'No point-in-time recovery verified', 'Isolated database and account retained for operator review']}
        write_json(report_dir / 'rehearsal.json', report)
    return {'operation': 'restore_rehearsal', 'status': 'verified_isolated_database', 'targetDatabase': target, 'productionRestore': 'approval_required'}

def aws_json(argv, timeout=120):
    return json.loads(run(['aws', '--no-cli-pager'] + argv + ['--output', 'json'], timeout=timeout))

def upload(args):
    require(args.approve_offhost_upload, 'Separate encrypted off-host upload approval required')
    require(bool(re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', args.bucket)) and '..' not in args.bucket, 'Invalid bucket name')
    require(bool(re.fullmatch(r'[A-Za-z0-9/_-]{1,160}', args.prefix)) and '..' not in args.prefix, 'Invalid object prefix')
    bundle, manifest, artifact = verify_bundle(args.bundle)
    require(not (bundle / 'offhost-receipt.json').exists(), 'Off-host receipt exists; use a new bundle rather than overwriting evidence')
    require(aws_json(['s3api', 'get-bucket-versioning', '--bucket', args.bucket]).get('Status') == 'Enabled', 'Destination versioning must already be enabled; no provisioning performed')
    versions = []
    for source in [artifact, bundle / 'manifest.json', bundle / 'manifest.sha256']:
        key = args.prefix.rstrip('/') + '/' + bundle.name + '/' + source.name
        digest = sha256(source); checksum = base64.b64encode(bytes.fromhex(digest)).decode()
        result = aws_json(['s3api', 'put-object', '--bucket', args.bucket, '--key', key, '--body', str(source),
                           '--server-side-encryption', 'AES256', '--checksum-algorithm', 'SHA256', '--checksum-sha256', checksum], args.timeout)
        version = result.get('VersionId')
        require(version and version != 'null', 'Upload did not return an immutable version ID')
        # Read back the exact version; a PUT/HEAD-only response is not a verified backup.
        with tempfile.TemporaryDirectory(prefix='readback-', dir=bundle) as temp:
            downloaded = Path(temp) / 'object'
            aws_json(['s3api', 'get-object', '--bucket', args.bucket, '--key', key, '--version-id', version, str(downloaded)], args.timeout)
            require(sha256(downloaded) == digest, 'Off-host read-back checksum mismatch')
        versions.append({'key': key, 'versionId': version, 'sha256': digest})
    write_json(bundle / 'offhost-receipt.json', {'status': 'verified_versioned_readback', 'bucket': args.bucket, 'objects': versions,
                                               'verifiedAt': dt.datetime.now(dt.timezone.utc).isoformat()})
    return {'operation': 'offhost_upload', 'status': 'verified_versioned_readback', 'objectCount': len(versions), 'bundleId': bundle.name}

def parser():
    cli = argparse.ArgumentParser(description=__doc__)
    sub = cli.add_subparsers(dest='command', required=True)
    b = sub.add_parser('backup'); b.add_argument('--client-config', required=True); b.add_argument('--passphrase-file', required=True)
    b.add_argument('--db-name', required=True); b.add_argument('--output-dir', required=True); b.add_argument('--acknowledge-source-read', action='store_true'); b.add_argument('--timeout', type=int, default=900)
    r = sub.add_parser('restore-rehearsal'); r.add_argument('--bundle', required=True); r.add_argument('--admin-config', required=True); r.add_argument('--passphrase-file', required=True)
    r.add_argument('--rehearsal-dir', required=True); r.add_argument('--isolation-marker', required=True); r.add_argument('--acknowledge-isolated-instance', action='store_true')
    r.add_argument('--host', default='127.0.0.1'); r.add_argument('--port', type=int, required=True); r.add_argument('--target-db'); r.add_argument('--timeout', type=int, default=900); r.add_argument('--max-sql-bytes', type=int, default=MAX_SQL)
    u = sub.add_parser('upload'); u.add_argument('--bundle', required=True); u.add_argument('--bucket', required=True); u.add_argument('--prefix', required=True)
    u.add_argument('--approve-offhost-upload', action='store_true'); u.add_argument('--timeout', type=int, default=900)
    v = sub.add_parser('verify'); v.add_argument('--bundle', required=True)
    return cli

def main():
    os.umask(0o077)
    try:
        args = parser().parse_args()
        require(not hasattr(args, 'timeout') or 10 <= args.timeout <= 3600, 'Deadline must be between 10 and 3600 seconds')
        require(not hasattr(args, 'max_sql_bytes') or 1 <= args.max_sql_bytes <= MAX_SQL, 'Invalid expanded SQL limit')
        if args.command == 'verify':
            verify_bundle(args.bundle); result = {'operation': 'verify', 'status': 'verified_local_encrypted', 'offHost': 'not_checked'}
        else:
            result = {'backup': backup, 'restore-rehearsal': restore, 'upload': upload}[args.command](args)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (SafetyError, OSError, ValueError, gzip.BadGzipFile, EOFError, UnicodeError):
        print(json.dumps({'status': 'failed_closed', 'operation': 'resilience', 'reason': 'Safety gate, integrity check or command failed; inspect private inputs and runbook. No production restore is supported.'}), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
