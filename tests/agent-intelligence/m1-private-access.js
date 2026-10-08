import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function assertM1PrivateAccess(file, mode) {
    if (process.platform !== 'win32') {
        if ((fs.statSync(file).mode & 0o777) !== mode) throw new Error('private_permissions_required');
        return;
    }
    const type = fs.statSync(file).isDirectory() ? 'Directory' : 'File';
    const script = '$ErrorActionPreference="Stop"; $me=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rules=[System.IO.' + type + ']::GetAccessControl($env:ATRIA_M1_PRIVATE_PATH).GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]); $bad=@($rules | Where-Object { $_.AccessControlType -eq "Allow" -and $_.IdentityReference.Value -notin @($me,"S-1-5-18","S-1-5-32-544") }); if($bad.Count -or -not $rules.Count){exit 1}';
    try { execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'pipe', env: { ...process.env, ATRIA_M1_PRIVATE_PATH: file } }); }
    catch { throw new Error('private_windows_acl_required'); }
}
