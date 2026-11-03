import gzip
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import backup_restore as br
from memory_credentials import ACTIVE_FDS, client_credentials, mysql_config

SQL = b'''/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;
CREATE TABLE `sample` (`id` int NOT NULL, `text` text, PRIMARY KEY (`id`)) ENGINE=InnoDB;
INSERT INTO `sample` VALUES (1,'safe; DROP DATABASE production; quoted');
'''

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='civicpath-fake-contract-')
        self.root = Path(self.temp.name); os.chmod(self.root, 0o700)
        self.passphrase = self.root / 'passphrase'; self.passphrase.write_text(secrets.token_hex(32) + '\n'); os.chmod(self.passphrase, 0o600)
    def tearDown(self):
        self.temp.cleanup()
    def encrypted_bundle(self):
        bundle = self.root / 'bundle'; bundle.mkdir(mode=0o700)
        artifact = bundle / 'database.sql.gz.enc'
        br.run(br.cipher_base(self.passphrase) + ['-salt', '-out', artifact], input=gzip.compress(SQL), timeout=30)
        os.chmod(artifact, 0o600)
        manifest = {'format': br.FORMAT, 'artifact': artifact.name, 'sha256': br.sha256(artifact), 'sizeBytes': artifact.stat().st_size,
                    'macSalt': secrets.token_hex(32), 'schema': {'tableCount': 1, 'tableInventorySha256': hashlib.sha256(b'sample').hexdigest()}}
        manifest['hmacSha256'] = br.authenticate(manifest, self.passphrase)
        br.write_json(bundle / 'manifest.json', manifest)
        (bundle / 'manifest.sha256').write_text(br.sha256(bundle / 'manifest.json') + '  manifest.json\n'); os.chmod(bundle / 'manifest.sha256', 0o600)
        return bundle, artifact, manifest
    def test_real_encryption_integrity_and_roundtrip(self):
        bundle, artifact, manifest = self.encrypted_bundle()
        self.assertNotIn(b'CREATE TABLE', artifact.read_bytes())
        br.verify_bundle(bundle)
        self.assertTrue(hmac.compare_digest(manifest['hmacSha256'], br.authenticate(manifest, self.passphrase)))
        plain = br.run(br.cipher_base(self.passphrase) + ['-d', '-in', artifact], timeout=30)
        self.assertEqual(gzip.decompress(plain), SQL)
        sql = self.root / 'verify.sql'; sql.write_bytes(gzip.decompress(plain)); br.validate_sql(sql)
        artifact.write_bytes(artifact.read_bytes() + b'tamper')
        with self.assertRaises(br.SafetyError): br.verify_bundle(bundle)
    def test_wrong_key_rejected_by_authentication(self):
        _bundle, _artifact, manifest = self.encrypted_bundle()
        wrong = self.root / 'wrong'; wrong.write_text(secrets.token_hex(32)); os.chmod(wrong, 0o600)
        self.assertFalse(hmac.compare_digest(manifest['hmacSha256'], br.authenticate(manifest, wrong)))
    def test_manifest_tamper_rejected_even_when_public_checksums_recomputed(self):
        bundle, artifact, manifest = self.encrypted_bundle()
        with open(bundle / 'manifest.json', 'a') as handle: handle.write(' ')
        with self.assertRaises(br.SafetyError): br.verify_bundle(bundle)
        artifact.write_bytes(artifact.read_bytes() + b'tamper')
        manifest['sha256'] = br.sha256(artifact); manifest['sizeBytes'] = artifact.stat().st_size
        self.assertFalse(hmac.compare_digest(manifest['hmacSha256'], br.authenticate(manifest, self.passphrase)))
    def test_production_target_and_default_port_rejected_before_db(self):
        marker = self.root / 'marker'; marker.write_text('CIVICPATH_ISOLATED_RESTORE_INSTANCE\n'); os.chmod(marker, 0o600)
        for name, host, port, approval in [('production', '127.0.0.1', 3317, True), ('civicpath', '127.0.0.1', 3317, True), ('cp_restore_20261103_abcdef123456', '127.0.0.1', 3306, True), ('cp_restore_20261103_abcdef123456', 'db.internal', 3317, True), ('cp_restore_20261103_abcdef123456', '127.0.0.1', 3317, False)]:
            with self.assertRaises(br.SafetyError): br.validate_isolation(SimpleNamespace(target_db=name, host=host, port=port, acknowledge_isolated_instance=approval, isolation_marker=marker))
    def test_sql_allowlist_rejects_destructive_cross_schema_and_stored_code(self):
        for sql in ['DROP DATABASE production;', 'USE production;', 'INSERT INTO `production`.`sample` VALUES (1);', "SELECT 'x' INTO OUTFILE '/tmp/x';", '/*!50000 DROP TABLE sample */;', 'CREATE TABLE `safe` (x int); \\! whoami;', 'SET GLOBAL event_scheduler=ON;', 'CREATE VIEW `sample` AS SELECT 1;', 'INSERT INTO `sample` SELECT * FROM sensitive;']:
            path = self.root / 'unsafe.sql'; path.write_text(sql)
            with self.assertRaises(br.SafetyError, msg=sql): br.validate_sql(path)
    def test_chunk_boundary_comments_and_literal_semicolons(self):
        text = ' ' * (1024 * 1024 - 1) + "/* ordinary */ CREATE TABLE `sample` (`id` int); INSERT INTO `sample` VALUES (1);"
        path = self.root / 'boundary.sql'; path.write_text(text); br.validate_sql(path)
    def test_private_permission_and_symlink_gates(self):
        bad = self.root / 'public'; bad.write_text('not-secret'); os.chmod(bad, 0o644)
        with self.assertRaises(br.SafetyError): br.private_file(bad)
        link = self.root / 'symlink'; link.symlink_to(self.passphrase)
        with self.assertRaises(br.SafetyError): br.private_file(link)
    def test_memory_credentials_are_inherited_not_persisted(self):
        config = mysql_config('generated_test', 'fake-password-not-production', '127.0.0.1', 3317)
        with client_credentials(config) as (path, fd):
            self.assertIn(fd, ACTIVE_FDS)
            self.assertEqual(br.run(['python3', '-c', 'import sys;print(open(sys.argv[1]).read(),end="")', path]).decode(), config)
            br.private_file(path)
        self.assertNotIn(fd, ACTIVE_FDS)
    def test_offhost_absent_approval_cannot_call_aws(self):
        with patch.object(br, 'aws_json', side_effect=AssertionError('no network')):
            with self.assertRaises(br.SafetyError): br.upload(SimpleNamespace(approve_offhost_upload=False))
    def test_offhost_versioned_readback_receipt_fake_contract(self):
        bundle, artifact, _manifest = self.encrypted_bundle()
        objects = {}; calls = []
        def fake_aws(argv, timeout=120):
            calls.append(argv[1])
            if argv[1] == 'get-bucket-versioning': return {'Status': 'Enabled'}
            key = argv[argv.index('--key') + 1]
            if argv[1] == 'put-object':
                objects[key] = Path(argv[argv.index('--body') + 1]).read_bytes(); return {'VersionId': 'fake-v1'}
            if argv[1] == 'get-object':
                Path(argv[-1]).write_bytes(objects[key]); return {}
            raise AssertionError('unexpected AWS command')
        with patch.object(br, 'aws_json', side_effect=fake_aws):
            result = br.upload(SimpleNamespace(approve_offhost_upload=True, bucket='nonlive-test-bucket', prefix='fake-contract', bundle=bundle, timeout=30))
        self.assertEqual(result['status'], 'verified_versioned_readback'); self.assertEqual(calls.count('get-object'), 3)
        receipt = json.loads((bundle / 'offhost-receipt.json').read_text()); self.assertEqual(len(receipt['objects']), 3)
    def test_nonversioned_destination_rejected(self):
        bundle, _artifact, _manifest = self.encrypted_bundle()
        with patch.object(br, 'aws_json', return_value={'Status': 'Suspended'}):
            with self.assertRaises(br.SafetyError): br.upload(SimpleNamespace(approve_offhost_upload=True, bucket='nonlive-test-bucket', prefix='fake-contract', bundle=bundle, timeout=30))
    def test_actual_pipeline_with_fake_mysql_commands_and_real_cipher(self):
        bin_dir = self.root / 'bin'; bin_dir.mkdir(mode=0o700)
        dump = bin_dir / 'mysqldump'
        dump.write_text('#!/usr/bin/env python3\nimport sys\nsys.stdout.buffer.write(' + repr(SQL) + ')\n'); dump.chmod(0o700)
        mysql = bin_dir / 'mysql'
        mysql.write_text('''#!/usr/bin/env python3
import sys
sql = sys.stdin.read()
if 'TABLE_NAME, TABLE_TYPE' in sql: print('sample\\tBASE TABLE')
elif 'SCHEMATA' in sql: print('0')
elif 'TRIGGER_SCHEMA' in sql: print('0\\n0\\n0\\n0')
elif sql == 'SELECT 1;': print('1')
elif 'CREATE USER' in sql: pass
else:
    assert any(arg.startswith('--database=cp_restore_') for arg in sys.argv)
    assert 'CREATE TABLE `sample`' in sql and 'INSERT INTO `sample`' in sql
'''); mysql.chmod(0o700)
        marker = self.root / 'marker'; marker.write_text('CIVICPATH_ISOLATED_RESTORE_INSTANCE\n'); marker.chmod(0o600)
        with patch.dict(os.environ, {'PATH': str(bin_dir) + ':' + os.environ['PATH']}):
            with client_credentials(mysql_config('fake_admin', 'test-only-password', '127.0.0.1', 3317)) as (config, _fd):
                result = br.backup(SimpleNamespace(acknowledge_source_read=True, db_name='civicpath_test_abcdef', client_config=config,
                                  passphrase_file=self.passphrase, output_dir=self.root / 'backups', timeout=30))
                bundle = self.root / 'backups' / result['bundleId']
                restored = br.restore(SimpleNamespace(acknowledge_isolated_instance=True, host='127.0.0.1', port=3317,
                    isolation_marker=marker, target_db=None, admin_config=config, passphrase_file=self.passphrase, bundle=bundle,
                    rehearsal_dir=self.root / 'rehearsals', timeout=30, max_sql_bytes=br.MAX_SQL))
        self.assertEqual(restored['status'], 'verified_isolated_database')
        report_dir = self.root / 'rehearsals' / restored['targetDatabase']
        self.assertEqual([path.name for path in report_dir.iterdir()], ['rehearsal.json'])

if __name__ == '__main__':
    unittest.main()
