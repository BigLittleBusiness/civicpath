"""Linux-only credential descriptors; no plaintext credentials persisted to the filesystem."""
from contextlib import contextmanager
import fcntl
import os
import re

ACTIVE_FDS = set()

@contextmanager
def client_credentials(data):
    # /proc/self/fd points at a sealed anonymous memory descriptor inherited by child CLIs.
    # /proc/<parent>/fd would fail in differently scoped process containers and exposes no benefit.
    if not hasattr(os, 'memfd_create'):
        raise ValueError('Linux anonymous in-memory descriptors are required')
    fd = os.memfd_create('civicpath-client', os.MFD_ALLOW_SEALING)
    try:
        os.write(fd, data.encode())
        os.fchmod(fd, 0o600)
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, fcntl.F_SEAL_WRITE | fcntl.F_SEAL_GROW | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_SEAL)
        ACTIVE_FDS.add(fd)
        yield f'/proc/self/fd/{fd}', fd
    finally:
        ACTIVE_FDS.discard(fd)
        os.close(fd)

def mysql_config(user, password, host, port):
    if not re.fullmatch(r'[A-Za-z0-9_]{1,64}', user) or not isinstance(password, str) or not 1 <= len(password) <= 256:
        raise ValueError('Invalid generated credentials')
    if any(char in password for char in '\x00\r\n'):
        raise ValueError('Credential contains unsupported characters')
    escaped = password.replace('\\', '\\\\').replace('"', '\\"')
    return f'[client]\nuser={user}\npassword="{escaped}"\nhost={host}\nport={port}\nprotocol=TCP\n'
