---
title: "Manually Porting the PS4 Visual Studio Integration to VS 2026"
published: 2025-11-29
draft: false
tags: [ 'PS4', 'Reverse Engineering', 'Visual Studio']
toc: true
---

If you are like me and still use the leaked Official PS4 SDK for developing some homebrew things you likely are stuck with the Visual Studio integrations that limits you to VS 2022. Since VS 2026 recently released and I wanted to try to migrate to the new version I needed to sort out if I could manually port the VS integration. I was able to successfully port the integration with the caveat that you do need to downgrade the `Microsoft.Build.CPPTasks.Common.Base.dll` library but it does not seem to have any effects on Visual Studio.

:::important
**DISCLAIMER**: This post is a technical guide on Visual Studio VSIX migration and toolchain compatibility. No proprietary PS4 SDK files or binaries are provided.
:::

## Manual Steps
Installation paths may vary depending on your system but for me they are the following:

```
VS_2022_PATH="C:\Program Files\Microsoft Visual Studio\2022\Community"
VS_2026_PATH="C:\Program Files\Microsoft Visual Studio\18\Community"
```

:::note
You may need to adjust this path depending on the version you have installed, for me I have the community version. The VS 2026 version may also be any number 18 or greater.
:::

1. Copy the extensions from `"$(VS_2022_PATH)\Common7\IDE\Extensions\SCE"` to `"$(VS_2026_PATH)\Common7\IDE\Extensions\SCE"`
2. Copy the templates from `"$(VS_2022_PATH)\Common7\IDE\ProjectTemplates\VC\PS4"` to `"$(VS_2026_PATH)\Common7\IDE\ProjectTemplates\VC\PS4"`.
3. Copy the template `.vstman` from `"$(VS_2022_PATH)\Common7\IDE\ProjectTemplates\PS4Templates.Project..vstman"` to `"$(VS_2026_PATH)\Common7\IDE\ProjectTemplates\PS4Templates.Project..vstman"`.
4. Copy the build platform from `"$(VS_2022_PATH)\MSBuild\Microsoft\VC\v170\Platforms\ORBIS"` to `"$(VS_2026_PATH)\MSBuild\Microsoft\VC\v180\Platforms\ORBIS"`.
5. Because this platform is for VS17 you will need to copy the `"Microsoft.Build.CPPTasks.Common.Base.dll"` from `"$(VS_2026_PATH)\MSBuild\Microsoft\VC\v170"` to `"$(VS_2026_PATH)\MSBuild\Microsoft\VC\v180"`.
6. Run the following command from an admin command prompt `"$(VS_2026_PATH)\Common7\IDE\devenv.exe /update"` to refresh the extensions & templates. 

## Auto Port Script
Since I am lazy I also created the following script you can use that should automatically port the VS integration.

**Usage Example:**
```powershell
.\Migrate-PS4-VS-Integration.ps1 -VS2022Path "C:\Program Files\Microsoft Visual Studio\2022\Community" -VS2026Path "C:\Program Files\Microsoft Visual Studio\18\Community"
```

```powershell title="Migrate-PS4-VS-Integration.ps1"
<#
.SYNOPSIS
    Manually ports the PS4 Visual Studio integration files from a VS 2022 installation
    to a VS 2026 installation.

.DESCRIPTION
    This script performs the necessary file and folder copies to make the PS4 SDK's
    VS integration elements (extensions, templates, build platform files) available
    in the newer Visual Studio 2026 environment. It also copies the required build
    DLL and runs the devenv /update command.

.PARAMETER VS2022Path
    The base installation path for Visual Studio 2022 (e.g., "C:\Program Files\Microsoft Visual Studio\2022\Community").

.PARAMETER VS2026Path
    The base installation path for Visual Studio 2026 (e.g., "C:\Program Files\Microsoft Visual Studio\18\Community").

.NOTES
    - This script must be run with administrator privileges due to copying files into "Program Files"
      and running the 'devenv /update' command.
    - Ensure Visual Studio 2026 is closed before running the script.
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$VS2022Path,

    [Parameter(Mandatory=$true)]
    [string]$VS2026Path
)

$ErrorActionPreference = "Stop"

function Copy-Items {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Description
    )
    Write-Host "-> Copying $Description..." -ForegroundColor Cyan
    try {
        # The -Recurse parameter is crucial for copying directories like SCE and ORBIS.
        Copy-Item -Path $Source -Destination $Destination -Recurse -Force
        Write-Host "   SUCCESS: Copied to $Destination" -ForegroundColor Green
    }
    catch {
        Write-Host "   ERROR: Failed to copy $Description. Details: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# --- STEP 1: Copy Extensions (SCE) ---
$Source1 = "$VS2022Path\Common7\IDE\Extensions\SCE"
$Dest1 = "$VS2026Path\Common7\IDE\Extensions\SCE"
Copy-Items -Source $Source1 -Destination $Dest1 -Description "Extensions (SCE)"

# --- STEP 2: Copy Project Templates (PS4) ---
$Source2 = "$VS2022Path\Common7\IDE\ProjectTemplates\VC\PS4"
$Dest2 = "$VS2026Path\Common7\IDE\ProjectTemplates\VC\PS4"
Copy-Items -Source $Source2 -Destination $Dest2 -Description "Project Templates (PS4)"

# --- STEP 3: Copy Template Manifest (.vstman) ---
$Source3 = "$VS2022Path\Common7\IDE\ProjectTemplates\PS4Templates.Project..vstman"
$Dest3 = "$VS2026Path\Common7\IDE\ProjectTemplates"
Copy-Items -Source $Source3 -Destination $Dest3 -Description "Template Manifest (.vstman)"

# --- STEP 4: Copy Build Platform (ORBIS) ---
$Source4 = "$VS2022Path\MSBuild\Microsoft\VC\v170\Platforms\ORBIS"
$Dest4 = "$VS2026Path\MSBuild\Microsoft\VC\v180\Platforms\ORBIS"
Copy-Items -Source $Source4 -Destination $Dest4 -Description "Build Platform (ORBIS)"

# --- STEP 5: Copy Required DLL (v170 to v180) ---
# This DLL is required because the platform files in step 4 target the v170 build tools.
$Source5 = "$VS2026Path\MSBuild\Microsoft\VC\v170\Microsoft.Build.CPPTasks.Common.Base.dll"
$Dest5 = "$VS2026Path\MSBuild\Microsoft\VC\v180"
Copy-Items -Source $Source5 -Destination $Dest5 -Description "Required CPPTasks DLL (v170 to v180)"

# --- STEP 6: Run devenv /setup ---
Write-Host "-> Running devenv /setup to refresh extensions and templates..." -ForegroundColor Yellow
try {
    Start-Process -FilePath "$VS2026Path\Common7\IDE\devenv.exe" -ArgumentList "/setup" -Wait
    Write-Host "   SUCCESS: Visual Studio update process finished." -ForegroundColor Green
}
catch {
    Write-Host "   ERROR: Failed to run devenv /setup. Details: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`nMigration Complete!" -ForegroundColor Green
```