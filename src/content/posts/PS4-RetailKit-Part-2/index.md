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