#import "ViewportMetricsLegacyEventEmitter.h"

#import <React/RCTBridge.h>
#import <React/RCTConstants.h>
#import <React/RCTComponentEvent.h>
#import <React/RCTEventDispatcherProtocol.h>
#import <React/UIView+React.h>

void ViewportMetricsDispatchLegacySnapshotEvent(
    UIView *view,
    id bridge,
    NSDictionary<NSString *, id> *body)
{
  (void)bridge;

  if (view == nil || bridge == nil || body == nil) {
    return;
  }

  NSNumber *reactTag = view.reactTag;
  if (reactTag == nil && view.tag != 0) {
    reactTag = @(view.tag);
  }
  if (reactTag == nil) {
    return;
  }

  RCTComponentEvent *event =
      [[RCTComponentEvent alloc] initWithName:@"onSnapshot" viewTag:reactTag body:body];
  if ([bridge respondsToSelector:@selector(eventDispatcher)]) {
    id<RCTEventDispatcherProtocol> eventDispatcher = [(id)bridge eventDispatcher];
    if (eventDispatcher != nil &&
        [eventDispatcher respondsToSelector:@selector(notifyObserversOfEvent:)]) {
      [eventDispatcher notifyObserversOfEvent:event];
      return;
    }
  }

  [[NSNotificationCenter defaultCenter] postNotificationName:RCTNotifyEventDispatcherObserversOfEvent_DEPRECATED
                                                      object:nil
                                                    userInfo:@{ @"event" : event }];
}
