// 앱 시작 시 PushKit(VoIP) 를 등록하고, VoIP 푸시가 오면 즉시 CallKit 에 수신 전화를 보고한다.
// (iOS 13+: VoIP 푸시를 받고 CallKit 에 보고하지 않으면 시스템이 앱을 종료시킨다)
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface CallSNSVoip : NSObject
+ (void)start;
@end

NS_ASSUME_NONNULL_END
