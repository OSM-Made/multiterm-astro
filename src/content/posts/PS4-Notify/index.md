---
title: "Unmasking PS4 Secrets: Dissecting Sony's Proprietary Notification Protocol"
published: 2025-11-27
draft: true
tags: [ 'PS4', 'Reverse Engineering']
toc: true
---

For years PS4 homebrew was using the rigid notify API’s exposed by Sony which didn’t allow for cool things like a custom icon. Something that kept nagging at me was the Spotify app since it had the unique ability to show the title of the song and the album art in the notify pop up. How was a third-party application able to feed a custom image to this highly restricted system? I failed to find this feature inside the Spotify application itself. This wasn't a feature exposed by Sony's public APIs.

**The black box was now my target.**