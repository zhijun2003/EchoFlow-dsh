# Mount echoflowai-tools into a dsh profile. Run from PowerShell.
#
# Read MOUNTING.md first: it records what was verified on this machine and
# why the flat fallback must not be edited.

param(
    [string]$ProfileDir = "$env:USERPROFILE\.dsh\profiles\desktop"
)

$ErrorActionPreference = "Stop"

Write-Host "profile: $ProfileDir"

if (-not (Test-Path "$ProfileDir\package.json")) {
    throw "No package.json under $ProfileDir - not a dsh profile?"
}

# 1. Install the tarball into the profile. A tarball is a plain file, so
#    copying it out of the WSL filesystem is reliable - unlike a symlink
#    whose target is a WSL UNC path, which Windows Node may
#    or may not follow (unverified).
#
#    --legacy-peer-deps is REQUIRED: the package declares 41 peerDependencies
#    and npm 11 exits 1 with an empty error block when it resolves them from
#    a tarball. See MOUNTING.md "Installing the tarball with npm".
$tarball = Join-Path $PSScriptRoot "dist\echoflowai-tools-0.1.0.tgz"
if (-not (Test-Path $tarball)) {
    throw "No tarball at $tarball. Build it first: ./build-tarball.sh"
}

Push-Location $ProfileDir
try {
    Write-Host "==> npm install tarball (--legacy-peer-deps)"
    npm install $tarball --legacy-peer-deps --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    # Prove it before touching the composition.
    $entry = Join-Path $ProfileDir "node_modules\echoflowai-tools\lib\index.js"
    if (-not (Test-Path $entry)) {
        throw "Installed but $entry is missing - the tarball is incomplete?"
    }
    Write-Host "    installed: $entry"
}
finally {
    Pop-Location
}

# 2. Mount as a bundle. A patch row cannot introduce a plugin from nothing.
$manifestPath = Join-Path $ProfileDir "package.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($manifest.dsh.profile.bundles -notcontains "echoflowai-tools") {
    $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles; "echoflowai-tools")
    $manifest | ConvertTo-Json -Depth 20 | Set-Content $manifestPath -Encoding utf8
    Write-Host "==> added 'echoflowai-tools' to dsh.profile.bundles"
} else {
    Write-Host "==> bundle entry already present"
}

# 3. Append the config row, keeping whatever the profile already has.
$patchPath = Join-Path $ProfileDir "cordis.patch.yml"
$snippet = Get-Content "$PSScriptRoot\cordis.mount.yml" -Raw
if ((Get-Content $patchPath -Raw) -notmatch "echoflow-account") {
    Add-Content $patchPath "`n$snippet"
    Write-Host "==> appended config row to cordis.patch.yml"
} else {
    Write-Host "==> config row already in cordis.patch.yml"
}

Write-Host ""
Write-Host "Done. Restart dsh."
Write-Host ""
Write-Host "Revert:"
Write-Host "  npm uninstall echoflowai-tools   # in $ProfileDir"
Write-Host "  drop 'echoflowai-tools' from dsh.profile.bundles in package.json"
Write-Host "  drop the echoflow-account row from cordis.patch.yml"
