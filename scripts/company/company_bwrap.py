#!/usr/bin/env python3
"""Four-slot supervisor for Paperclip's native Bubblewrap launches (Linux only).

Install as `company-bwrap` on the service PATH, outside writable agent workspaces.
This limits supervised processes, not every model HTTP request or account quota.
"""
from __future__ import annotations
import ctypes
import errno
import fcntl
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

SLOTS = 4
BWRAP = '/usr/bin/bwrap'
WAIT_SECONDS = 300
RUN_SECONDS = 3600
POLL_SECONDS = 0.2


def secure_directory(directory: Path) -> int:
    """Open a private owner-controlled directory without following its symlink."""
    directory.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(fd)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(fd)
        raise PermissionError('STATE_DIRECTORY_MUST_BE_OWNED_AND_0700')
    return fd


def secure_file(dir_fd: int, name: str) -> int:
    fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=dir_fd)
    info = os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
        os.close(fd)
        raise PermissionError('UNSAFE_STATE_FILE')
    return fd


def stopped(dir_fd: int) -> bool:
    try:
        os.stat('STOP', dir_fd=dir_fd, follow_symlinks=False)
        return True  # Any entry, including a symlink, fails closed.
    except FileNotFoundError:
        return False


def parent_death_signal(parent_pid: int):
    """Terminate bwrap when its supervisor dies, including SIGKILL of supervisor."""
    def prepare():
        libc = ctypes.CDLL(None, use_errno=True)
        if libc.prctl(1, signal.SIGKILL, 0, 0, 0) != 0:  # PR_SET_PDEATHSIG
            os._exit(78)
        if os.getppid() != parent_pid:
            os._exit(78)
    return prepare


def terminate_group(proc: subprocess.Popen, grace: float = 5) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = time.monotonic() + grace
    while proc.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    # Kill remaining group members even when the immediate child has exited.
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    proc.wait()


def supervise(command: list[str], directory: Path, *, wait_seconds: float = WAIT_SECONDS,
              run_seconds: float = RUN_SECONDS, grace_seconds: float = 5) -> int:
    """Internal testable supervisor. Production main fixes the executable and limits."""
    if sys.platform != 'linux':
        raise RuntimeError('LINUX_REQUIRED')
    dir_fd = secure_directory(directory)
    slot_fd = None
    proc = None
    received = []
    old_handlers = {}
    def cancel(signum, _frame):
        if not received:
            received.append(signum)
    try:
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            old_handlers[sig] = signal.signal(sig, cancel)
        deadline = time.monotonic() + wait_seconds
        while slot_fd is None:
            if received:
                return 128 + received[0]
            if stopped(dir_fd):
                return 75
            for index in range(SLOTS):
                fd = secure_file(dir_fd, f'slot-{index}')
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    slot_fd = fd
                    break
                except OSError as error:
                    os.close(fd)
                    if error.errno not in (errno.EACCES, errno.EAGAIN):
                        raise
            if slot_fd is None:
                if time.monotonic() >= deadline:
                    return 75
                time.sleep(POLL_SECONDS)
        if stopped(dir_fd) or received:
            return 75 if not received else 128 + received[0]
        proc = subprocess.Popen(command, start_new_session=True,
                                preexec_fn=parent_death_signal(os.getpid()), close_fds=True)
        deadline = time.monotonic() + run_seconds
        while proc.poll() is None:
            if received:
                return 128 + received[0]
            if stopped(dir_fd):
                return 75
            if time.monotonic() >= deadline:
                return 124
            time.sleep(POLL_SECONDS)
        return proc.returncode if proc.returncode >= 0 else 128 - proc.returncode
    finally:
        if proc is not None:
            terminate_group(proc, grace_seconds)
        if slot_fd is not None:
            os.close(slot_fd)
        os.close(dir_fd)
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)


def control(directory: Path, action: str) -> dict:
    dir_fd = secure_directory(directory)
    try:
        if action == '--company-stop':
            fd = secure_file(dir_fd, 'STOP')
            os.fsync(fd); os.close(fd)
        elif action == '--company-resume':
            try:
                os.unlink('STOP', dir_fd=dir_fd)
            except FileNotFoundError:
                pass
        elif action != '--company-status':
            raise ValueError('UNKNOWN_CONTROL')
        busy = 0
        for index in range(SLOTS):
            fd = secure_file(dir_fd, f'slot-{index}')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                busy += 1
            finally:
                os.close(fd)
        return {'scope': 'MANAGED_BWRAP_PROCESSES_ONLY', 'slots': SLOTS, 'busy': busy, 'stopped': stopped(dir_fd)}
    finally:
        os.close(dir_fd)


def main() -> int:
    if sys.platform != 'linux':
        print('company-bwrap: LINUX_REQUIRED', file=sys.stderr); return 78
    parent = Path(f'/run/user/{os.getuid()}')
    if not parent.is_dir() or parent.is_symlink():
        print('company-bwrap: USER_RUNTIME_DIRECTORY_REQUIRED', file=sys.stderr); return 78
    directory = parent / 'paperclip-company-slots'
    args = sys.argv[1:]
    try:
        if len(args) == 1 and args[0].startswith('--company-'):
            print(json.dumps(control(directory, args[0]))); return 0
        if not os.path.isfile(BWRAP) or not os.access(BWRAP, os.X_OK):
            raise RuntimeError('BWRAP_NOT_INSTALLED')
        # Paperclip normally supplies this. Keep it mandatory on every launch.
        command = [BWRAP, '--die-with-parent', *args]
        return supervise(command, directory)
    except (OSError, ValueError, RuntimeError):
        # Do not print argv, environment, credentials, or sensitive paths.
        print('company-bwrap: CONFIGURATION_OR_PROCESS_ERROR', file=sys.stderr); return 78


if __name__ == '__main__':
    raise SystemExit(main())
