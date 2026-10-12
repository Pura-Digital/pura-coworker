#import <AppKit/AppKit.h>
#import <Security/Security.h>

// Password entry belongs exclusively to macOS SecurityAgent. This helper never
// receives a password or reads keychain item values.
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL checkOnly = argc == 2 && strcmp(argv[1], "--check") == 0;
    if (argc != 2 || (!checkOnly && strcmp(argv[1], "--authorize") != 0)) return 2;
    if (!checkOnly) {
      [NSApplication sharedApplication];
      [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
      SecKeychainSetUserInteractionAllowed(true);
    }
    SecKeychainRef keychain = NULL;
    OSStatus result = SecKeychainCopyDefault(&keychain);
    SecKeychainStatus status = 0;
    if (result == errSecSuccess) result = SecKeychainGetStatus(keychain, &status);
    if (!checkOnly && keychain) {
      if (result != errSecSuccess || !(status & kSecUnlockStateStatus)) [NSApp activateIgnoringOtherApps:YES];
      result = SecKeychainUnlock(keychain, 0, NULL, false);
      if (result == errSecSuccess) result = SecKeychainGetStatus(keychain, &status);
    }
    BOOL unlocked = result == errSecSuccess && (status & kSecUnlockStateStatus);
    if (keychain) CFRelease(keychain);
    printf("{\"unlocked\":%s,\"status\":%d}\n", unlocked ? "true" : "false", (int)result);
    return unlocked ? 0 : 1;
  }
}
