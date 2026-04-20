#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ExpoAlarmCountdown, NSObject)

RCT_EXTERN_METHOD(updateAlarmNotification:(NSString)title
                  secondsLeft:(NSInteger)secondsLeft)

RCT_EXTERN_METHOD(clearAlarmNotification:(NSString)title)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
