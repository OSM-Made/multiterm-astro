---
title: 'PS4 RetailKit Part 1: Introduction'
published: 2025-07-3
draft: false
series: 'PS4 RetailKit'
tags: [ 'RetailKit', 'PS4', 'Debugger', 'DECI']
toc: true
---

## The Debugger Isn’t Gone, It’s Just Sleeping

For years, it was assumed that Sony stripped all debugger functionality from Retail PS4 kernels, that nothing remained to work with.

> Sony stripped the debugger out of the retail kernel. There’s nothing left to enable.

That belief became dogma.

But it’s wrong.

After extensive reverse engineering, I can confidently say: the debugger is still there. The core infrastructure including memory inspection, process control, and module introspection remains fully present in Retail. It's simply gated behind checks that can be bypassed.

This post marks the beginning of a deep-dive into how Sony's internal debugger (mdbg) works, what remains in Retail, and how I revived much of its functionality without rebuilding everything from scratch.

## Devkits vs. Retail – What Really Differs

While Devkit and Retail PS4s use different kernel binaries, the core functionality behind mdbg is much more similar than most assume. After comparing both, I found only a few meaningful differences:

- On Devkits, mdbg_basic skips checks for Assist Mode entirely. Retail kernels include these checks, similar to what you’d see on Testkits.
- Devkit kernels reserve a section of direct memory specifically for the GPU debugger. This memory reservation is missing in both Retail and Testkit builds.

These are mostly policy level differences. The underlying mechanisms: syscalls, dispatch tables, and handlers are still present on Retail systems, just gated behind additional checks.

## My Motivation

This project began as a curiosity, I wanted to know how much of the original debugger remained in the Retail kernel, and whether any of it could still be reactivated. At the time, I was building my own debugger and encountering frustrating system instability, which led me to look more closely at how Sony’s official debugger was implemented and what I might be missing.

My initial goals were simple:
- Validate what debugger logic still exists in the Retail kernel (especially now that I had a Devkit kernel to compare with).
- Identify anything left behind that could be re-enabled.
- Do it as cleanly and minimally as possible, no huge coding projects.

That simple investigation turned into a full reverse engineering effort. This series is my attempt to document what I uncovered and how others might build on it.

## High-Level Overview of the Outcome

Over the course of this project:

- I confirmed that the kernel portion of the debugger logic was present in Retail Kernels.
- I reverse engineered the sony debugging library for mdbg.
- I dug into mdbg_basic from the Retail Kernel to identify what needs to be patched.
- I would also identify what needs to be patched in shellcore, syscore and some associated libraries for the DECI daemon to boot successfully.
- I would get a better understanding of how the debugger is supposed to function and why my implementation caused system instability.
- I would later discover that even the dev activation still exists and needs to be bypassed to activate our retail development kit!

What follows is a technical deep dive into how I got there with the hope that it helps others understand how some more of the PS4’s debugging abilities work under the hood.

## Credits

I just want to give a special thanks to the following people for some of their research they shared public as well as those who helped me test my theories.

[LM](https://github.com/LightningMods) - For the Fuse implementation.

[PsxDev](https://github.com/psxdev) - For additional [Fuse research](https://psxdev.github.io/itisalive.html).

[Faultz](https://github.com/Faultz) - For testing, rubber ducking & helping dig into some bugs.

[idc](https://github.com/idc) - For the original ps4libdoc & [Fuse research](https://github.com/idc/ps4-experiments-405/tree/master/fuse_loader).

[CrazyVoid](https://github.com/CrazyVoid) - For their fork of the ps4libdoc.

[Psdevwiki](https://www.psdevwiki.com/ps4/) - Anyone who contributed public info on Psdevwiki that I may have referenced.

[Sistro](https://github.com/SiSTR0) - For assistance sourcing & curating credits.