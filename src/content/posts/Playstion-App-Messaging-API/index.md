---
title: "Reverse Engineering Playstions App Messaging IPC"
published: 2025-11-30
draft: false
tags: [ 'PS4', 'Reverse Engineering', 'App Messaging', 'IPC', 'SceShellCore', 'SceShellUI']
toc: true
---

I found the `App Messaging` API's when I was digging around for what *IPC(Inter-Process Communications)* methods sony has and this one under the hood makes use of their `IPMI` system for *IPC*. So I took some time to reverse engineer this API since it could prove useful since it seems to have the ability to send *IPC* payloads to any process that has an `appId`.

## Known Symbols
As usual I found something interesting while digging through some known symbols some folks have gathered. The one of note that caught my eye was a library [`libSceAppMessaging`](https://github.com/CrazyVoid/ps4libdoc/blob/e414db67fddede397f86819ac0d2a0cbda5b4d34/system/common/lib/libSceSystemService.sprx.json#L22) which is packed into the `libSceSystemService.sprx`.

```c Title="libSceAppMessaging Symbols"
sceAppMessagingClearEventFlag
sceAppMessagingReceiveMsg
sceAppMessagingSendMsg
sceAppMessagingSendMsgToShellCore
sceAppMessagingSendMsgToShellUI
sceAppMessagingSetEventFlag
sceAppMessagingTryGetEventFlag
sceAppMessagingTryReceiveMsg
```

## Investigating libSceAppMessaging in libSceSystemService.sprx
I first took a look at the method `sceAppMessagingSendMsg()` and I noticed a pattern which I had seen before on the PS4 which is this is using their IPMI for IPC.

```c++
int sceAppMessagingSendMsg(
        unsigned int a1,
        unsigned int a2,
        __int64 a3,
        unsigned __int64 a4,
        unsigned int a5)
{
  int result;

  if ( !qword_442A8 )
    return 0x80C50002;
  result = 0x80C50003;
  if ( a4 <= 0x2000 )
  {
    if ( qword_452B8 )
      return qword_452B8(a1, a2, a3, a4, a5);
    else
      return sub_53D0(qword_442A8, a1, a2, a3, a4, a5);
  }
  return result;
}
```

The qword `qword_442A8` will be the instance of the IPMI client and if we follow the references for this it takes us to the following method that initializes the IPMI client.

```c++
int sub_4EC0()
{
  unsigned int v0;
  unsigned int v2;
  unsigned int v3;
  /*...*/
  IPMI::Client::Config v6;

  v0 = scePthreadMutexInit(&unk_442A0, 0LL, "SceAppMessaging");
  if ( !v0 )
  {
    IPMI::Client::Config::Config(&v6);

    /*...*/

    v10 = IPMI::Client::Config::MsgQueueConfig::estimateMsgQueueSize(
            (IPMI::Client::Config::MsgQueueConfig *)((char *)&loc_2011 + 7),
            1,
            v2);

    v0 = -1;

    if (IPMI::Client::Config::estimateClientMemorySize(&v6) <= 0x1000 )
    {
      v3 = IPMI::Client::create(&qword_442A8, &v6, 0LL, &unk_442B0);

      /*...*/

    }
  }

  return v0;
}
```

I have not at this time reverse engineered the IPMI enough to exactly understand the setup and how it knows where the IPC requests go but I can dig around till I find the server set up which will likely have the same strings for naming like `SceAppMessaging`.

I find just that in `SceShellCore` though its a bit much to include here if you want to follow along you can find the server creation by cross referencing the string `"SceAppMessaging"` in `SceShellCore`.

In the function that calls the server creation function we find that a class is new'd up and in the vtable for that class contains the functions that are called when the IPMI server receives these IPC requests from a client. 

```c++
int sub_7910(__int64 a1, int a2, unsigned int **a3, __int64 a4, __int64 a5, unsigned int a6)
{
  unsigned int v9;

  switch ( a2 )
  {
    // sceAppMessagingSendMsgToShellUI
    case 2:
      v9 = sub_170F90(/*...*/);
      return /*...*/;
    
    // sceAppMessagingSendMsgToShellCore
    case 1:
      v9 = sub_170F20(/*...*/);
      return /*...*/;
    
    // sceAppMessagingSendMsg
    case 0: 
      v9 = sub_170EC0(/*...*/);
      return /*...*/;
  }

  return 0x800205C1;
}
```

This might be a bit confusing but we can ignore most of it since we really only care about what is going on here. We can identify which of these cases line up to our functions in `SceSystemService` due to the IPMI request index as seen in the client side code for `sceAppMessagingSendMsg()`.

```c++ Title="sceAppMessagingSendMsg request"
int sub_53D0(__int64 a1, int a2, int a3, __int64 a4, __int64 a5, int a6)
{
   __int64 result;
  __int8 v7[24];
  unsigned int v8;
  __int8 v9[32];
  __int64 v10;

  *(_DWORD *)v7 = a2;
  *(_DWORD *)&v7[4] = a3;
  *(_QWORD *)&v7[8] = a5;
  *(_QWORD *)v9 = v7;
  *(_QWORD *)&v9[8] = 24;
  *(_QWORD *)&v9[16] = a4;
  *(_DWORD *)&v7[16] = a6;
  *(_QWORD *)&v9[24] = a5;

  v8 = 0;

  // send msg from IPMI client:
  result = (*(__int64 (__fastcall **)(__int64, _QWORD, _QWORD *, __int64, unsigned int *, _QWORD, _DWORD))(*(_QWORD *)a1 + 0x58LL))(
             a1,
             0,     // Request Index
             v11,
             2, 
             &v8,
             0,
             0);

  if ( !result )
    return v8;

  return result;
}
```

:::tip
Setting the *lvar type* to a *byte array(__int8)* in IDA will make it easier to reverse engineer the unknown type from the stack.
:::

The second arg passed into the IPMI send message function is the request index. If we take a look at the function `sub_1709C0()` which corresponds to that IPMI request we see that it seems like it is just forwarding the message to the app specified. 

The code here is a bit complex but it gives us a picture of the path the data takes to get to our destination.

``` Title="Message Flow"
Sender -> Kernel(IPMI) -> ShellCore -> ... -> Receiver
```

## What can SceShellUI tell us?
Since this is fairly complex code and I know that `SceShellUI` is involved I decided it was a good idea to check to see if any of the C# code has any info about these functions.

Lucky for us it does! In fact it pretty much spoon feeds it to us...

```c#
public struct SceAppMessage
{
    public int sender;

    public uint msgType;

    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8192)]
    public byte[] payload;

    public uint payloadSize;

    public ulong timestamp;
}
```

We have the full data type that is filled out and transfered around & we even have the function arguments from this as well!

```c#
[DllImport("libSceAppMessagingWrapper", EntryPoint = "sceAppMessagingSendMsg")]
private static extern int _sceAppMessagingSendMsg(int destAppId, uint msgType, [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 3)] byte[] payload, uint payloadSize, uint flags);

/*...*/

[DllImport("libSceAppMessagingWrapper", EntryPoint = "sceAppMessagingSetEventFlag")]
private static extern int _sceAppMessagingSetEventFlag(int destAppId, ulong bitPattern);

[DllImport("libSceAppMessagingWrapper", EntryPoint = "sceAppMessagingClearEventFlag")]
private static extern int _sceAppMessagingClearEventFlag(int destAppId, ulong bitsToClear);

[DllImport("libSceAppMessagingWrapper", EntryPoint = "sceAppMessagingTryGetEventFlag")]
private static extern int _sceAppMessagingTryGetEventFlag(ulong bitsToGet, ref ulong pResultPat, bool clearObtainedBits);
```

![](easy.gif)

With all of this juicy info we can make some methods for our use in c++.

## C++ functions & data types

```c++ Title="Data Types"
// Credits: https://www.psdevwiki.com/ps4/Talk:Error_Codes for error code definitions
#define SCE_APP_MESSAGING_ERROR_INTERNAL                0x80C50001
#define SCE_APP_MESSAGING_ERROR_UNAVAILABLE             0x80C50002
#define SCE_APP_MESSAGING_ERROR_PAYLOAD_SIZE_TOO_LARGE  0x80C50003
#define SCE_APP_MESSAGING_ERROR_NULL_POINTER            0x80C50004
#define SCE_APP_MESSAGING_ERROR_NO_MESSAGE              0x80C50005
#define SCE_APP_MESSAGING_ERROR_NO_MEMORY               0x80C50006
#define SCE_APP_MESSAGING_ERROR_NO_SUCH_APP             0x80C50007

#define SCE_APP_MESSAGING_MSG_TYPE_SESSION_INVITATION        0x1000000
#define SCE_APP_MESSAGING_MSG_TYPE_GAME_CUSTOM_DATA          0x1000001
#define SCE_APP_MESSAGING_MSG_TYPE_LAUNCH_APP                0x1000002
#define SCE_APP_MESSAGING_MSG_TYPE_PS_BUTTON_SHORT_PRESS     0x1000003
#define SCE_APP_MESSAGING_MSG_TYPE_PS_BUTTON_DOUBLE_PRESS    0x1000004
#define SCE_APP_MESSAGING_MSG_TYPE_APP_LAUNCH_LINK           0x1000005
#define SCE_APP_MESSAGING_MSG_TYPE_INVITATION                0x1000001
#define SCE_APP_MESSAGING_MSG_TYPE_PLAY_TOGETHER_HOST        0x1000009
#define SCE_APP_MESSAGING_MSG_TYPE_PLAY_TOGETHER_HOST_A      0x100000C

#define SCE_APP_MESSAGING_MSG_FLAG_OVERWRITE 1

struct SceAppMessage
{
    int Sender;
    uint32_t MessageType;
    char Payload[8192];
    uint32_t PayloadSize;
    uint64_t TimeStamp;
};
```

```c++ Title="Functions"
int sceAppMessagingSendMsgToShellCore(uint32_t msgType, const void* payload, uint32_t payloadSize, uint32_t flags);
int sceAppMessagingSendMsgToShellUI(uint32_t msgType, const void* payload, uint32_t payloadSize, uint32_t flags);
int sceAppMessagingSendMsg(int destAppId, uint32_t msgType, const void* payload, uint32_t payloadSize, uint32_t flags);
int sceAppMessagingReceiveMsg(SceAppMessage* message);
int sceAppMessagingTryReceiveMsg(SceAppMessage* message);

int sceAppMessagingClearEventFlag(int destAppId, uint64_t bitsToClear);
int sceAppMessagingSetEventFlag(int destAppId, uint64_t bitPattern);
int sceAppMessagingTryGetEventFlag(uint64_t bitsToGet, uint64_t* resultPat, bool clearObtainedBits);
```
:::note
For use with the offical SDK and full definitions you can check out my [StubMaker](https://github.com/OSM-Made/StubMaker) project.
:::

## Usage
I have tested the following method for doing IPC between two processes and confirmed this does function as long as the `SceSystemService` was initialized on the process and it has an `appId`.

### Messaging
```c++ Title="Sending Process"
int appId = 0; // Set your appId of your other proc.
const char* message = "Hello World.";

sceAppMessagingSendMsg(appId, 0, message, strlen(message), 0);

```

```c++ Title="Receiving Process"
ScePthread threadHandle;
scePthreadCreate(&threadHandle, 0, [](void* arg) -> void*
{
    while (true)
    {
        SceAppMessage message;
        auto res = sceAppMessagingReceiveMsg(&message);

        if (res == SCE_APP_MESSAGING_ERROR_NO_MESSAGE)
        {
            sceKernelSleep(1);
            continue;
        }

        if (res != 0)
        {
            printf("Error: sceAppMessagingReceiveMsg() returned 0x%x\n", res);
            break;
        }

        if (message.MessageType == 0) // Our message Id.
        {
            printf("Got message: %s from %d @ %ld\n", message.Payload, message.Sender, MonotonicToUnixTime(message.TimeStamp));
        }
    }

    scePthreadExit(0);
    return 0;
}, 0, "Msg Thread");
scePthreadDetach(threadHandle);
```

```cmd Title="Result logs"
Got message: Hello World. from 1610619149 @ 1764485182
```

There is a few more things that can be tested still like I believe `sceAppMessagingTryReceiveMsg()` will peek the message buffer with out consuming the message.

#### Timestamp Quirks
As I was testing I noticed that the timestamp was weird so I dug into the `SceShellCore` code we saw before and I found that was where the system will add the timestamp to the message.

```c++ Title="ShellCore fetching the time"
SceKernelTimespec time;
sceKernelClockGettime(4, time);

auto timeStamp = 1000000 * realtimeSpec.tv_sec + realtimeSpec.tv_nsec / 1000;
```

Here we can see a few things for the reason the timestamp is weird. This method is converting the time in seconds to micro seconds & the interesting choice here is actually the first argument of `sceKernelClockGettime()` which is the `ClockType` and `4` corresponds to `SCE_KERNEL_CLOCK_MONOTONIC` which means the number of seconds since the system booted.

So to convert this time to a unix time in seconds which would be more useful to me I came up with the following function.

```c++
uint64_t MonotonicToUnixTime(uint64_t monotonicMicroSeconds)
{
    SceKernelTimespec realtimeSpec;
    sceKernelClockGettime(SCE_KERNEL_CLOCK_REALTIME, &realtimeSpec);
    
    SceKernelTimespec monotonicSpec;
    sceKernelClockGettime(SCE_KERNEL_CLOCK_MONOTONIC, &monotonicSpec);

    return (monotonicMicroSeconds / 1000000) + (realtimeSpec.tv_sec - monotonicSpec.tv_sec);
}
```

### Event Flags
This is another interesting thing for some more research for those interested since it seems like this is a way to quickly signal another process for some sort of event. I included some of the event flags that I found during my resarch here but I will leave the testing and further research as a fun challenge for readers!:smile:

```c++ Title="Event Flags"
#define SCE_APP_MESSAGING_EVENT_SUSPEND_REQUEST                         0x800000000000000
#define SCE_APP_MESSAGING_EVENT_ON_RESUME                               0x4000000000000000  
#define SCE_APP_MESSAGING_EVENT_SPECIAL_RESUME                          0x400000000000000
#define SCE_APP_MESSAGING_EVENT_ON_PRE_SUSPEND                          0x200000000000000
#define SCE_APP_MESSAGING_EVENT_MSG_ARRIVAL                             0x8000000000000000
#define SCE_APP_MESSAGING_EVENT_GAME_LIVE_STREAMING_STATUS_UPDATE       0x2000000000000000
#define SCE_APP_MESSAGING_EVENT_DISPLAY_SAFE_AREA_UPDATE                0x1000000000000000
#define SCE_APP_MESSAGING_EVENT_ENTITLEMENT_UPDATE                      0x0100000000000000
#define SCE_APP_MESSAGING_EVENT_OPEN_SHARE_MENU                         0x0080000000000000
#define SCE_APP_MESSAGING_EVENT_IRO_ENTITLEMENT_UPDATE                  0x0040000000000000
#define SCE_APP_MESSAGING_EVENT_ADDCONTENT_INSTALL                      0x0020000000000000
#define SCE_APP_MESSAGING_EVENT_RESET_VR_POSITION                       0x0010000000000000
#define SCE_APP_MESSAGING_EVENT_CLOSED_CAPTIONS_UPDATE                  0x0008000000000000
#define SCE_APP_MESSAGING_EVENT_PLAYGO_LOCUS_UPDATE                     0x0004000000000000
#define SCE_APP_MESSAGING_EVENT_YOUTUBE_ACCOUNT_LINK_STATUS_CHANGED     0x0002000000000000
#define SCE_APP_MESSAGING_EVENT_EYE_DISTANCE_UPDATE                     0x0001000000000000
#define SCE_APP_MESSAGING_EVENT_WEBBROWSER_CLOSED                       0x0000800000000000
#define SCE_APP_MESSAGING_EVENT_CONTROLLER_SETTINGS_CLOSED              0x0000400000000000
```