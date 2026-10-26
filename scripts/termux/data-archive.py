"""Offline Atria backup/restore. The shell owns the stopped-process boundary."""
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile
import uuid


def targets(settings):
    result = {
        'data': Path(settings['data']),
        'config.yaml': Path(settings['config']),
        'plugins': Path(settings['plugins']),
        'public/scripts/extensions/third-party': Path(settings['extensions']),
        'secrets.json': Path(settings['root']) / 'secrets.json',
        '.env': Path(settings['root']) / '.env',
    }
    for name, destination in result.items():
        resolved = destination.resolve()
        if resolved == Path(resolved.anchor) or resolved == Path.home().resolve():
            raise ValueError('Refusing unsafe target: ' + str(destination))
        if destination.is_symlink():
            raise ValueError('Restore target must not be a symlink: ' + str(destination))
        for other_name, other in result.items():
            if name != other_name and (resolved == other.resolve() or resolved in other.resolve().parents):
                raise ValueError('Overlapping configured backup targets: ' + name + ', ' + other_name)
    return result


def regular_only(info):
    if not (info.isfile() or info.isdir()):
        raise ValueError('Links/special files are not supported in backups: ' + info.name)
    return info


def backup(settings, output):
    sources = targets(settings)
    if not sources['data'].is_dir():
        raise ValueError('Data directory does not exist')
    output = output.resolve()
    if any(source.resolve() == output or source.resolve() in output.parents for source in sources.values()):
        raise ValueError('Backup destination must be outside the archived directories')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.partial-' + uuid.uuid4().hex)
    try:
        with tarfile.open(temporary, 'w:gz', dereference=False) as archive:
            for name, source in sources.items():
                if source.exists():
                    archive.add(source, arcname=name, filter=regular_only)
        if output.exists():
            raise ValueError('Refusing to overwrite an existing backup')
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    print(str(output))


def checked_members(archive):
    members = archive.getmembers()
    seen = set()
    allowed = ('data', 'config.yaml', 'plugins', 'public/scripts/extensions/third-party', 'secrets.json', '.env')
    parents = ('public', 'public/scripts', 'public/scripts/extensions')
    for member in members:
        raw = member.name
        name = str(PurePosixPath(raw))
        if '\\' in raw or '\0' in raw or '\n' in raw or PurePosixPath(raw).is_absolute() or '..' in PurePosixPath(raw).parts:
            raise ValueError('Unsafe archive path: ' + raw)
        regular_only(member)
        if name == '.' and member.isdir():
            continue
        if name in parents and member.isdir():
            continue
        if not any(name == prefix or name.startswith(prefix + '/') for prefix in allowed):
            raise ValueError('Unknown archive content: ' + name)
        if name in seen:
            raise ValueError('Duplicate archive path: ' + name)
        seen.add(name)
    if not any(name == 'data' or name.startswith('data/') for name in seen):
        raise ValueError('Backup has no data/ directory; legacy custom-root archives need manual import')
    return members


def restore(settings, archive_path, snapshot_path):
    destinations = targets(settings)
    # Extraction never writes to live targets. Reject links, traversal and special files first.
    with tempfile.TemporaryDirectory(prefix='atria-restore-') as stage_name:
        stage = Path(stage_name)
        with tarfile.open(archive_path, 'r:gz') as archive:
            members = checked_members(archive)
            required = sum(member.size for member in members if member.isfile())
            if required > shutil.disk_usage(stage).free:
                raise ValueError('Not enough private storage to stage this archive')
            for member in members:
                destination = stage / str(PurePosixPath(member.name))
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, destination.open('xb') as output:
                        shutil.copyfileobj(source, output)
                    destination.chmod(member.mode & 0o777)
        if not (stage / 'data').is_dir():
            raise ValueError('Archive data/ must be a directory')
        if (stage / 'config.yaml').exists():
            subprocess.run(['node', str(Path(settings['root']) / 'scripts/termux/runtime-tools.js'),
                            'restore-config', settings['root'], str(stage / 'config.yaml'), str(snapshot_path)], check=True)
        prepared, published = [], []
        try:
            for name, target in destinations.items():
                source = stage / name
                if not source.exists():
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                unique = uuid.uuid4().hex
                new = target.with_name(target.name + '.restore-new-' + unique)
                old = target.with_name(target.name + '.restore-old-' + unique)
                prepared.append((new, target, old))
                if source.is_dir():
                    shutil.copytree(source, new)
                else:
                    shutil.copy2(source, new)
            for new, target, old in prepared:
                if target.exists():
                    target.rename(old)
                published.append((target, old))
                new.rename(target)
        except BaseException:
            for target, old in reversed(published):
                if target.exists():
                    remove(target)
                if old.exists():
                    old.rename(target)
            raise
        else:
            for _, old in published:
                if old.exists():
                    remove(old)
        finally:
            for new, _, _ in prepared:
                if new.exists():
                    remove(new)
    print('Restore complete; current data/plugin paths and port retained.')


def remove(target):
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()


def main():
    command, snapshot_name, file_name = sys.argv[1:]
    snapshot_path = Path(snapshot_name).resolve()
    settings = json.loads(snapshot_path.read_text(encoding='utf-8'))
    if settings['mode'] not in ('fs', 'sqlite'):
        raise ValueError('Use the application/database tools to back up external MySQL/PostgreSQL data')
    if command == 'backup':
        backup(settings, Path(file_name))
    elif command == 'check':
        with tarfile.open(file_name, 'r:gz') as archive:
            checked_members(archive)
        print('Archive validated')
    elif command == 'restore':
        restore(settings, Path(file_name), snapshot_path)
    else:
        raise ValueError('Unknown archive command')


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('[atria-termux] ' + str(error), file=sys.stderr)
        sys.exit(1)
