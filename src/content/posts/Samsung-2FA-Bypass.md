---
title: "How I Found a High-Severity 2FA Bypass in Samsung Accounts."
published: 2025-12-03
draft: true
tags: [ 'Security Research', 'Responsible Disclosure', 'Authentication Bypass', 'Samsung', '2FA' ]
toc: true
---

## Summary

In 2024, I discovered a high-severity vulnerability in Samsung Account's two-factor authentication system that allowed an attacker to completely bypass 2FA protections on any account. This was my first major vulnerability disclosure, and Samsung responded professionally with a fix deployed within 8 weeks.

**The core issue:** Samsung's 2FA request API disclosed sensitive device information including IMEIs and phone numbers to anyone who knew a victim's username. No authentication required. That leaked IMEI could then be transformed into a "trusted device" identifier allowing an attacker with the victim's password to authenticate as if they were using the victim's phone.

**The attack in four lines of console output:**
```
> Please Enter the account username...
victim@email.com
> Leaked device Found: Galaxy S21 Ultra IMEI: [REDACTED] IP: 192.0.2.100
> Please Enter the account password...
```

From there, the attacker receives full authentication tokens and access to the victim's Samsung Account and Samsung Cloud data like photos, backups, find-my-device, everything.

**Impact:** This vulnerability was confirmed as high severity by Samsung's security team. It affected Samsung Account and Samsung Cloud globally, was scalable across any number of accounts, and fundamentally undermined the security model that 2FA is supposed to provide. Samsung patched the vulnerability in December of 2024.

### Disclosure Timeline
- **October 2024**: Vulnerability discovered and reported to [Samsung Security](https://security.samsungmobile.com/main.smsb)
- **December 2024**: Fix confirmed deployed globally (~8-week turnaround)

### Key takeaways
- Unauthenticated API endpoints should return the absolute minimum information necessary.
- Sensitive identifiers (IMEIs, phone numbers, IP addresses) should never be exposed without authentication.
- A secure system can be completely undermined by a single chatty endpoint.

### Responsible Disclosure Note

:::important
This writeup describes a vulnerability that has been **fully patched** by Samsung as of December 2024. All technical details shared here are for educational purposes and to help other researchers understand common API security pitfalls. The vulnerability is no longer exploitable on current Samsung Account systems.
:::

## Background & Discovery
I stumbled onto this vulnerability while inspecting network traffic on my own Samsung device using [HTTP Toolkit](https://httptoolkit.com/). I noticed something odd: when triggering a 2FA request, the API response contained a surprising amount of data about my device and account **BEFORE** I had even authenticated.

That immediately caught my attention. Why would an unauthenticated endpoint return detailed device information? And more importantly, could that information be used to impersonate a trusted device?

### Following the Thread
The API response included fields like `devicePhysicalAddressText` (which turned out to be the IMEI), phone numbers, IP addresses, and various device identifiers. I started testing which of these values the authentication API actually validated.

Through trial and error, I found I could spoof most of the device fields without issue. But one value kept blocking me: `deviceUniqueId`. If this didn't match what Samsung expected, the API would demand 2FA confirmation.

### The Breakthrough
Using [Jadx](https://github.com/skylot/jadx) to decompile Samsung's Android apps, specifically `com.osp.app.signin` and a mobile services package, I traced how `deviceUniqueId` was generated. It was a straightforward transformation of the device's IMEI, just the IMEI run through a deterministic algorithm.

That was the moment it clicked: the API was leaking the IMEI, and the IMEI was all I needed to generate a valid `deviceUniqueId`. The trusted device check could be completely bypassed using information the API freely handed out.

## Technical Deep-Dive

### The Leaky Endpoint

The vulnerability started with Samsung's 2FA request API:
```
POST https://us-auth2.samsungosp.com/v2/profile/user/2factor/authentication/request
```

This endpoint is designed to send a 2FA code to a user's trusted devices. The only required input was the account username.

The problem was the response. When requesting a code be sent to trusted devices, the API returned detailed information about every trusted device on the account:
```csharp
public class UserDevice
{
    // ...
    [XmlElement("devicePhysicalAddressText")]
    public string DevicePhysicalAddressText { get; set; } // IMEI
    [XmlElement("phoneNumberText")]
    public string PhoneNumberText { get; set; }
    [XmlElement("clientIP")]
    public string ClientIP { get; set; }
    [XmlElement("deviceSerialNumberText")]
    public string DeviceSerialNumberText { get; set; }
    [XmlElement("deviceName")]
    public string DeviceName { get; set; }
    // ...
}
```

Just by knowing someone's email address, an attacker could retrieve their device's IMEI, phone number, IP address, and serial number.

### Bypassing 2FA

The authentication endpoint for Samsung Account is:
```
POST https://us-auth2.samsungosp.com/auth/oauth2/v2/requestAuthentication
```

Samsung's trusted device verification relies on a field called `deviceUniqueId`, which is derived from the device's IMEI through a deterministic transformation. Since the IMEI was leaked by the 2FA request endpoint, an attacker could compute the expected `deviceUniqueId` and include it in their authentication request.

From the API's perspective, the request appeared to come from a legitimate trusted device so it skipped the 2FA challenge entirely.

### The Attack Flow
```csharp
static async Task Main()
{
    // Step 1: Only need the victim's username
    Console.WriteLine("Please Enter the account username...");
    var accountUsername = Console.ReadLine();

    // Step 2: Leak device details (no auth required)
    var leakedDeviceDetails = await LeakDeviceDetails(accountUsername);
    Console.WriteLine($"Leaked device Found: {leakedDeviceDetails.DeviceName} IMEI: {leakedDeviceDetails.DevicePhysicalAddressText} IP: {leakedDeviceDetails.ClientIP}");

    // Step 3: Password required from here
    Console.WriteLine("Please Enter the account password...");
    var accountPassword = Console.ReadLine();

    // Step 4: Authenticate using leaked device details, bypassing 2FA
    var (samsungAccount, userAuthToken, accessToken, userId) = await AuthenticateLogin(accountUsername, accountPassword, leakedDeviceDetails);
    Console.WriteLine($"2FA bypassed userAuthToken: {userAuthToken} accessToken: {accessToken}");

    // Step 5: Access account data
    var accountDetails = await samsungAccount.GetAccountDetails(userId, accessToken);
    // ...
}
```

With valid tokens in hand, an attacker has full access to the victim's Samsung Account including Samsung Cloud backups, photos, Find My Mobile, and the ability to modify account security settings.

## Impact

This vulnerability chain had severe implications:

### Information Disclosure at Scale

The unauthenticated 2FA request endpoint could be queried for any Samsung Account username. An attacker could harvest sensitive device information across thousands of accounts without ever triggering a login attempt or alert beyond the 2FA code. 

The leaked data included:
- **IMEI**: Uniquely identifies a device, can be used for tracking or fraud.
- **Phone numbers**: Enables phishing, SIM swap attacks, or further social engineering.
- **IP addresses**: Reveals approximate location and network information.
- **Device serial numbers**: Potentially useful for warranty fraud or social engineering with Samsung support.

### Complete 2FA Bypass

For any account where the attacker also knows the password (from phishing, credential stuffing, or data breaches), the 2FA protection was rendered useless. 

The attacker could:
- Authenticate as a trusted device without possessing that device.
- Obtain full session tokens (`AccessToken`, `UserAuthToken`, `RefreshToken`).
- Access Samsung Cloud data: photos, backups, notes, contacts.
- Use Find My Mobile to locate, lock, or wipe victim devices.
- Modify account security settings, potentially locking out the legitimate user.

:::note
This bypass specifically affected accounts using Samsung's "trusted device" 2FA method rather than SMS based verification. However, trusted device is the default and more convenient option and likely the majority of users with 2FA enabled.
:::

### Why Samsung Rated This High Severity

- **No authentication required** for the initial information leak.
- **Scalable**: Any account could be targeted with just a username.
- **Chainable**: The leak directly enabled the 2FA bypass.
- **Undermined core security**: 2FA exists specifically to protect accounts when passwords are compromised; this nullified that protection entirely.

## Lessons Learned

### The Disclosure Process
Samsung's security team was responsive and professional. Reports were acknowledged quickly and updates came at reasonable intervals, though communication was fairly clinical or straightforward status updates rather than back-and-forth discussion. The vulnerability was confirmed and patched within two months, which is a solid turnaround for a major vendor.

Samsung awarded a cash bounty for this report. No CVE was assigned, which is typical most organizations reserve CVEs for remote code execution or similarly critical classes of bugs rather than authentication bypasses.

### Advice for First-Time Researchers

This was my first responsible disclosure, and my main advice is simple: just do it.

- **Report what you find**: Don't second-guess yourself or assume a bug is too small to matter. Let the security team assess severity.
- **Provide detail**: Explain the vulnerability clearly, include reproduction steps, and document the impact.
- **Bring a POC**: A working proof of concept removes ambiguity and helps the team understand exactly what you found. It made all the difference in this report.

### Technical Takeaways

My background is primarily in low-level reverse engineering using disassemblers and debuggers, not web traffic. This discovery changed my perspective. I'd always focused on binaries, but this vulnerability existed entirely in the API layer.

Since this finding, I've approached APIs with the same scrutiny I'd give a compiled binary, and that shift has led to three additional vulnerability discoveries with other major vendors.

Sometimes the biggest holes aren't buried deep in assembly they're sitting in plaintext HTTP responses, waiting for someone to look.