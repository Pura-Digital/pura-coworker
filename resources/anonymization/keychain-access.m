#import <AppKit/AppKit.h>
#import <Security/Security.h>

// SecurityAgent owns password entry. No passwords or item values reach Aiden.
static int authorize(BOOL checkOnly, NSString *resultFile) {
  SecKeychainRef keychain = NULL;
  OSStatus result = SecKeychainCopyDefault(&keychain);
  SecKeychainStatus status = 0;
  if (result == errSecSuccess) result = SecKeychainGetStatus(keychain, &status);
  if (!checkOnly && keychain) {
    SecKeychainSetUserInteractionAllowed(true);
    result = SecKeychainUnlock(NULL, 0, NULL, false);
    if (result == errSecSuccess) result = SecKeychainGetStatus(keychain, &status);
  }
  BOOL unlocked = result == errSecSuccess && (status & kSecUnlockStateStatus);
  if (keychain) CFRelease(keychain);
  printf("{\"unlocked\":%s,\"status\":%d}\n", unlocked ? "true" : "false", (int)result);
  fflush(stdout);
  if (resultFile) {
    NSDictionary *reply = @{ @"unlocked": @(unlocked), @"status": @(result) };
    NSData *json = [NSJSONSerialization dataWithJSONObject:reply options:0 error:nil];
    if (![json writeToFile:resultFile options:NSDataWritingAtomic error:nil]) return 1;
  }
  return unlocked ? 0 : 1;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2 || argc > 3) return 2;
    if (strcmp(argv[1], "--check") == 0) return authorize(YES, nil);
    if (strcmp(argv[1], "--authorize") != 0) return 2;
    NSString *resultFile = argc == 3 ? [NSString stringWithUTF8String:argv[2]] : nil;
    if (resultFile && ![[NSFileManager defaultManager] fileExistsAtPath:[resultFile stringByDeletingLastPathComponent]]) return 2;
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    // Removing the private request directory cancels the launched app as well
    // as the launcher, including while SecurityAgent is waiting for the user.
    dispatch_source_t cancellation = nil;
    if (resultFile) {
      cancellation = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
      dispatch_source_set_timer(cancellation, dispatch_time(DISPATCH_TIME_NOW, 250 * NSEC_PER_MSEC), 250 * NSEC_PER_MSEC, 25 * NSEC_PER_MSEC);
      dispatch_source_set_event_handler(cancellation, ^{
        if (![[NSFileManager defaultManager] fileExistsAtPath:[resultFile stringByDeletingLastPathComponent]]) exit(2);
      });
      dispatch_resume(cancellation);
    }
    // Run a real app event loop while SecurityAgent waits for human input.
    // A bare command-line process can fail before presenting any system UI.
    dispatch_async(dispatch_get_main_queue(), ^{
      [NSApp activateIgnoringOtherApps:YES];
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        int result = authorize(NO, resultFile);
        dispatch_async(dispatch_get_main_queue(), ^{ exit(result); });
      });
    });
    [NSApp run];
    return 1;
  }
}
