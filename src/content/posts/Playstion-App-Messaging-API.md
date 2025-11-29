---
title: "Reverse Engineering Playstions App Messaging IPC"
published: 2025-11-29
draft: true
tags: [ 'PS4', 'Reverse Engineering', 'App Messaging', 'IPC']
toc: true
---

I found the `App Messaging` API's when I was digging around for what *IPC(Inter-Process Communications)* methods sony has and this one under the hood makes use of their `IPMI` system for *IPC*. So I took some time to reverse engineer this API since it could prove useful since it seems to have the ability to send *IPC* payloads to any process that has an `appId`.

## Investigating libSceSystemService.sprx
