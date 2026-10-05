"""Bounded process/PTY driver. Runs only inside the test's credential-free network namespace."""
import json
import os
import pathlib
import pty
import select
import signal
import subprocess
import sys
import time

root = pathlib.Path(sys.argv[1])
node, cli = sys.argv[2:4]
results = []
for mode in ('print', 'json', 'rpc', 'interactive'):
    for scenario in ('direct', 'discovery', 'disabled', 'excluded'):
        case = root / (mode + '-' + scenario)
        case.mkdir()
        (case / 'home').mkdir()
        (case / 'agent').mkdir()
        (case / 'tmp').mkdir()
        (case / 'imports.json').write_bytes((root / 'imports.json').read_bytes())
        env = {'PATH': os.environ['PATH'], 'HOME': str(case / 'home'), 'TMPDIR': str(case / 'tmp'),
               'PI_CODING_AGENT_DIR': str(case / 'agent'), 'PI_OFFLINE': '1',
               'JOBS_CLI_FIXTURE_ROOT': str(case), 'JOBS_CLI_SCENARIO': scenario,
               'TERM': 'xterm-256color', 'NO_COLOR': '1'}
        (case / 'agent' / 'settings.json').write_text(json.dumps({
            'compaction': {'enabled': False}, 'retry': {'enabled': False},
            'quietStartup': True, 'enableInstallTelemetry': False,
            'extensions': ['-builtin:codemode', '-builtin:tool-search'] if scenario == 'disabled' else [],
            'defaultTools': ['+codemode', '+tool_search'] if scenario == 'discovery' else [],
        }))
        args = [node, cli, '--offline', '--no-session', '--no-approve', '--no-context-files',
                '--no-skills', '--no-prompt-templates', '--no-themes',
                '--provider', 'fixture', '--model', 'fixture', '--thinking', 'off',
                '-e', str(root / 'pi-cli-extension.mjs')]
        if scenario == 'direct':
            args += ['--no-extensions']
        if scenario == 'excluded':
            args += ['--exclude-tools', 'bash,jobs_inspect,goal_inspect,herdr_inspect']
        if mode == 'print':
            args += ['--print', 'fixture']
        elif mode in ('json', 'rpc'):
            args += ['--mode', mode]
            if mode == 'json':
                args += ['fixture']
        else:
            args += ['fixture']
        master = slave = None
        output = bytearray()
        stderr = b''
        if mode == 'interactive':
            master, slave = pty.openpty()
            process = subprocess.Popen(args, cwd=case, env=env, stdin=slave, stdout=slave,
                                       stderr=slave, start_new_session=True)
            os.close(slave)
            slave = None
        else:
            process = subprocess.Popen(args, cwd=case, env=env, stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            if mode == 'interactive':
                deadline = time.monotonic() + 15
                quit_sent = False
                while process.poll() is None and time.monotonic() < deadline:
                    ready, _, _ = select.select([master], [], [], 0.05)
                    if ready:
                        try:
                            output.extend(os.read(master, 65536))
                        except OSError:
                            break
                    if (case / 'settled.json').exists() and not quit_sent:
                        os.write(master, b'\x04')  # Native quit on empty editor, not forced process termination.
                        quit_sent = True
                process.wait(timeout=3)
            elif mode == 'rpc':
                process.stdin.write(b'{"id":"fixture","type":"prompt","message":"fixture"}\n')
                process.stdin.flush()
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    ready, _, _ = select.select([process.stdout], [], [], 0.05)
                    if ready:
                        line = os.read(process.stdout.fileno(), 65536)
                        if not line:
                            break
                        output.extend(line)
                    # Settlement record is written by the actual native notification handler.
                    if (case / 'settled.json').exists():
                        break
                assert (case / 'settled.json').exists(), 'RPC never settled'
                process.stdin.close()
                process.stdin = None
                tail, stderr = process.communicate(timeout=5)
                output.extend(tail)
            else:
                stdout, stderr = process.communicate(b'', timeout=15)
                output.extend(stdout)
            assert process.returncode == 0, (mode, scenario, process.returncode, stderr, output)
            settled = json.loads((case / 'settled.json').read_text())
            assert settled['phase'] >= 2, settled
            assert b'CLI-SEAM-PASS' in output, (mode, scenario, output)
            if mode in ('json', 'rpc'):
                records = [json.loads(line) for line in output.split(b'\n') if line.strip()]
                assert any(r.get('type') == 'agent_settled' for r in records), records
            results.append({'mode': mode, 'scenario': scenario, 'exit': process.returncode, 'settled': settled})
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            if master is not None:
                os.close(master)
            (case / 'stdout.log').write_bytes(output)
            (case / 'stderr.log').write_bytes(stderr)
            (root / 'cli-results.json').write_text(json.dumps(results, indent=2))
print(json.dumps({'cases': len(results), 'result': 'passed'}))
