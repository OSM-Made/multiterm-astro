---
title: 'PS4 RetailKit Part 2: Mdbg Investigation'
published: 2025-07-4
draft: false
series: 'PS4 RetailKit'
tags: [ 'RetailKit', 'PS4', 'Debugger', 'DECI']
toc: true
---

## Introduction

In this post, I take a deeper look into the PS4's hidden debugging infrastructure, focusing on how the libmdbg_syscore interface communicates with the kernel and reveals functionality typically reserved for development hardware. Despite Sony’s software based restrictions, I show how much of the mdbg_basic system remains intact on Retail consoles, and how with the right conditions many debug operations can still be executed successfully.

## FUSE: Still Present on Retail

One of the first signs that the Retail PS4 kernel retains dormant debugging infrastructure is the FUSE initialization code. When comparing the Devkit and Retail kernel binaries, I found that the FUSE initialization logic is identical across both. Sony didn’t remove or stub out this part of the system for Retail builds they simply gated its activation behind runtime checks.

**Devkit**
```c
int fuse_init(__int64 a1, int destroy)
{
  /* ... */

  IsAssistMode = sceKernelCheckDipsw(2LL);
  IsDevelopmentMode = sceKernelCheckDipsw(0LL);
  if ( sceSblAIMgrIsDevKit() && IsAssistMode | IsDevelopmentMode || sceSblAIMgrIsTestKit() && IsAssistMode)
  {
    if ( destroy == 1 )
    {
      /* Tear down Fuse */
      /* ... */
    }
    else
    {
      /* Stand up Fuse */
      /* ... */
    }
  }
  return v3;
}
```

**Retail**
```c
int fuse_init(__int64 a1, int destroy)
{
  /* ... */

  IsAssistMode = sceKernelCheckDipsw(2u);
  IsDevelopmentMode = sceKernelCheckDipsw(0);
  if ( sceSblAIMgrIsDevKit() && IsAssistMode | IsDevelopmentMode || sceSblAIMgrIsTestKit() && IsAssistMode)
  {
    if ( destroy == 1 )
    {
      /* Tear down Fuse */
      /* ... */
    }
    else
    {
      /* Stand up Fuse */
      /* ... */
    }
  }
  return v3;
}
```

Here, ``IsAssistMode`` and ``IsDevelopmentMode`` are flags determined from dip switches via ``sceKernelCheckDipsw``. On Retail consoles, these switches are not accessible or set, so the condition always fails. Likewise, ``sceSblAIMgrIsDevKit()`` and ``sceSblAIMgrIsTestKit()`` check the [IDPS product code](https://www.psdevwiki.com/ps4/Console_ID) to identify the hardware type. These values are hard-coded at the factory and cannot be changed under normal operating conditions so they too always return false on Retail.

This shows that Sony had a clear opportunity to remove FUSE related code entirely from Retail builds, but chose not to. Instead, they relied on environment checks to suppress activation, further reinforcing the idea that Retail and Devkit kernels share far more in common than is often assumed.

## libmdbg_syscore
With kernel side debug features like FUSE still intact, the next question was: Where can I find some more of this hidden debug code? That’s where ``libmdbg_syscore.sprx`` comes in. While digging through some documented symbols in [this github](https://github.com/CrazyVoid/ps4libdoc/blob/e414db67fddede397f86819ac0d2a0cbda5b4d34/system/priv/lib/libmdbg_syscore.sprx.json#L761) repository, I came across a set of debug functions with the ``sceDebug`` prefix. These turned out to belong to ``libmdbg_syscore.sprx`` a library likely used to interface with the kernel portion of the debugger.

Curious how this worked under the hood, I started analyzing the binary. I found that it invokes syscall 573, known internally as ``mdbg_call``, to communicate with the kernel:

```c
uint8_t buf_ctrl[0x20];
uint8_t buf_in[0x40];
uint8_t buf_out[0x20];

// Set dispatch ID in buf_ctrl at offset 0x8
*(uint64_t *)&buf_ctrl[8] = 30; 

/* ... */

int result = mdbg_call(buf_ctrl, buf_in, buf_out);
```

I didn’t reverse the structure fully, but it was clear the first buffer ``(buf_ctrl)`` contained a **command ID at offset +0x8**, and later, also a **group ID at +0x0**. When examining syscall ``573`` in the kernel, I found that these groups map to specific dispatch tables with **group 1 being mdbg_basic**, the one we care about most.

```c
int sys_mdbg_call(void* td, sys_mdbg_call_args *uap)
{
    /* ... */

    // Makes sure this call comes from proc with system cred.
    if (!sceSblACMgrIsSystemUcred(*(__int64 *)(td + 304))) {
      return 78;
    }
    
    /* ... */

    switch (group) {
      case 7:
          result = mdbg_coredump_callback(td, control, input, output);
          break;

      case 6:
          // This path requires boot flag for allowing system level debugging to be set.
          if (!sceSblACMgrIsAllowedSystemLevelDebugging())
              return 78;
                
          result = mdbg_sdbgp_callback(td, control, input, output);
          break;

      case 1:
          // All of the functionality we care about lives here.
          result = mdbg_basic_callback(td, control, input, output);
          break;

      default:
          return 3;
    }
    
    /* ... */

    return result;
}
```

The structure of ``mdbg_basic`` on Retail matched the Devkit closely but just like FUSE Sony would choose to guard the use of the commands with environment checks and checks to the calling process.

I noticed that every sceDebug call began by invoking **command 30**, and looking at the implementation in Retail kernel, there were these access checks:

```c
case 0x1ELL:
      if ( !sceSblACMgrIsCoredumpProcess(*(_QWORD *)(a1 + 304))
        && !sub_8B460(*(_QWORD *)(a1 + 304)) // Unknown process AuthID.
        && (!sceKernelIsAssistMode() || !sceSblACMgrIsDebuggerProcess(*(_QWORD *)(a1 + 304)))
        && !sceSblACMgrIsSyscoreProcess(*(_QWORD *)(a1 + 304)) )
      {
        return 1;
      }
      
      /* ... */
      
      return 0;
```



This means one of the following must be true for the call to succeed:

- The calling process is the coredump handler.
- The calling process is the debugger and Assist Mode is enabled.
- The calling process is syscore.

This matches the behavior on Testkits exactly. Devkits are slightly looser, but the difference is negligible for our purpose.

The good news? This check is **trivial to bypass**. Changing your process ``AuthID`` to that of the debugger ``(0x3800000000010003)`` and enabling ``Assist Mode`` allows it through. Looking at other commands like ``0x12`` (ReadProcessMemory), the same check is repeated so the same bypass works.

Other checks like ``sceSblACMgrIsDebuggableProcess()``, ``sceSblACMgrIsAllowedSystemLevelDebugging()``, or ``sceSblRcMgrIsAllowULDebugger()`` that are also present are also easy to patch to always return true.

## Validating and Experimenting
Confident the Retail kernel’s side was intact, I started reversing the userland methods in libmdbg_syscore.sprx. Without getting too deep into that RE process, here’s a simple test I ran:

```c++
auto res = sceDebugAttachProcess(pid);
Logger::Info("sceDebugAttachProcess: %x\n", res);

res = sceDebugResumeProcess(pid);
Logger::Info("sceDebugResumeProcess: %x\n", res);

int pidList[100];
int pidCount = 0;
res = sceDebugGetProcessList(pidList, 100, &pidCount);
Logger::Info("sceDebugGetProcessList: %x\n", res);
Logger::Info("pidCount: %d\n", pidCount);

for (int i = 0; i < pidCount; i++)
{
    DebugProcessInfo processInfo;
    res = sceDebugGetProcessInfo(pidList[i], &processInfo);
    Logger::Info("[%d] %s %s %X", pidList[i], processInfo.Name, processInfo.ExecutablePath, processInfo.AppId);

    uint64_t moduleList[255];
    int moduleCount = 0;
    sceDebugGetModuleList(pidList[i], moduleList, 255, &moduleCount);
    Logger::Info("  Module Count: %d", moduleCount);
    
    for (int i = 0; i < moduleCount; i++)
    {
        DebugModuleInfo moduleInfo;
        sceDebugGetModuleInfo(processInfo.pid, moduleList[i], &moduleInfo);

        Logger::Info("	[%d] %s/%s", moduleList[i], moduleInfo.Name, moduleInfo.OriginalName);
        Logger::Info("		%s", moduleInfo.Path);
    }
}

res = sceDebugDetachProcess(pid);
Logger::Info("sceDebugDetachProcess: %x\n", res);
```



Much to my surprise with these new found patches everything would just work. 

Some more details on the methods I reversed can be found [here](https://github.com/OSM-Made/StubMaker/blob/Fury/include/mdbg.h).

## Conclusion
These findings confirm that Sony’s Retail kernel retains nearly the full debug backend, with ``mdbg_basic``, FUSE, and associated syscalls all still present and functional just hidden behind environment checks. By mimicking the correct environment and patching a few guard rails, we can unlock a surprising amount of Devkit like functionality on Retail hardware.

In **Part 3**, we’ll take this a step further by exploring the **DECI daemon** and what it would take to bring Sony’s official debugger back to life.