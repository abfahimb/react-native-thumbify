#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RNThumbify, NSObject)

RCT_EXTERN_METHOD(generate:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearCache:(NSString *)directory
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getCacheSize:(NSString *)directory
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
