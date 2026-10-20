# Mount echoflowai-tools into a dsh profile. Run from PowerShell.
#
# Read MOUNTING.md first: it records what was verified on this machine and
# why the flat fallback must not be edited.

param(
    # Where the plugin's package.json is, as WINDOWS sees it. The repo lives
    # in the WSL filesystem, so from Windows this is the UNC path.
    [string]$PluginDir = "/home/zhijun/WorkSpace/dsh/openlux-plugin-account",

    [string]$ProfileDir = "$env:USERPROFILE\.dsh\profiles\desktop"
)

$ErrorActionPreference = "Stop"

Write-Host "plugin : $PluginDir"
Write-Host "profile: $ProfileDir"

if (-not (Test-Path "$PluginDir\package.json")) {
    throw "No package.json under $PluginDir. From Windows the WSL path is /home/zhijun/..."
}
if (-not (Test-Path "$ProfileDir\package.json")) {
    throw "No package.json under $ProfileDir - not a dsh profile?"
}

# 1. Place the package where Node finds it BEFORE the flat fallback.
#    A symlink keeps edits live; a `pnpm add file:` copies and needs a
#    reinstall per change. Default to the live link.
$link = Join-Path $ProfileDir "node_modules\echoflowai-tools"
if (Test-Path $link) {
    $item = Get-Item $link -Force
    if ($item.LinkType -eq "SymbolicLink" -or $item.LinkType -eq "Junction") {
        Write-Host "==> link already present -> $($item.Target)"
    } else {
        throw "$link exists and is not a link. Remove it first (a real directory here shadows the flat fallback silently)."
    }
} else {
    Write-Host "==> creating symlink $link"
    New-Item -ItemType SymbolicLink -Path $link -Target $PluginDir | Out-Null
}

# Prove Windows can actually read through it before touching the composition.
$entry = Join-Path $link "lib\index.js"
if (-not (Test-Path $entry)) {
    throw "Link created but $entry is not readable through it. Windows Node will not follow this target either - try a checkout on C: instead."
}
Write-Host "    readable: $entry"

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
Write-Host "  Remove-Item -Force '$link'"
Write-Host "  drop 'echoflowai-tools' from dsh.profile.bundles in package.json"
Write-Host "  drop the echoflow-account row from cordis.patch.yml"
