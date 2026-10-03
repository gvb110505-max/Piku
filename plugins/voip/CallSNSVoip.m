#import "CallSNSVoip.h"

#import <PushKit/PushKit.h>
#import <RNVoipPushNotification/RNVoipPushNotificationManager.h>
#import "RNCallKeep.h"

@interface CallSNSVoip () <PKPushRegistryDelegate>
@property (nonatomic, strong) PKPushRegistry *registry;
@end

@implementation CallSNSVoip

+ (instancetype)shared
{
  static CallSNSVoip *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [CallSNSVoip new];
  });
  return instance;
}

+ (void)start
{
  CallSNSVoip *me = [self shared];
  if (me.registry != nil) {
    return;
  }
  // 앱이 꺼진 상태에서 VoIP 푸시로 깨어났을 때도 CallKit 이 준비돼 있어야 한다
  [RNCallKeep setup:@{
    @"appName": @"CallSNS",
    @"supportsVideo": @YES,
    @"maximumCallGroups": @"1",
    @"maximumCallsPerCallGroup": @"1",
    @"includesCallsInRecents": @NO,
  }];
  me.registry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
  me.registry.delegate = me;
  me.registry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
}

- (void)pushRegistry:(PKPushRegistry *)registry
    didUpdatePushCredentials:(PKPushCredentials *)credentials
                     forType:(PKPushType)type
{
  // JS 로 'register' 이벤트(VoIP 토큰) 전달 → device_tokens.voip_token 으로 저장
  [RNVoipPushNotificationManager didUpdatePushCredentials:credentials forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry didInvalidatePushTokenForType:(PKPushType)type
{
}

- (void)pushRegistry:(PKPushRegistry *)registry
    didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
                              forType:(PKPushType)type
                withCompletionHandler:(void (^)(void))completion
{
  NSDictionary *data = payload.dictionaryPayload;
  NSString *callId = [data[@"callId"] isKindOfClass:[NSString class]] ? data[@"callId"] : [[NSUUID UUID] UUIDString];
  NSString *callerName = [data[@"callerName"] isKindOfClass:[NSString class]] ? data[@"callerName"] : @"CallSNS";
  BOOL hasVideo = [data[@"media"] isKindOfClass:[NSString class]] && [data[@"media"] isEqualToString:@"video"];

  // JS 에도 알림 (앱이 이미 떠 있으면 수신 화면 동기화)
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload forType:(NSString *)type];

  [RNCallKeep reportNewIncomingCall:callId
                             handle:callerName
                         handleType:@"generic"
                           hasVideo:hasVideo
                localizedCallerName:callerName
                    supportsHolding:NO
                       supportsDTMF:NO
                   supportsGrouping:NO
                 supportsUngrouping:NO
                        fromPushKit:YES
                            payload:data
              withCompletionHandler:nil];
  completion();
}

@end
