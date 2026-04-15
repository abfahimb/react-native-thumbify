// Mock expo-modules-core for Jest
jest.mock('expo-modules-core', () => ({
  requireNativeModule: () => ({
    generate: jest.fn().mockResolvedValue({ path: '/tmp/thumb.jpg', width: 100, height: 100, size: 1024 }),
    clearCache: jest.fn().mockResolvedValue(undefined),
    getCacheSize: jest.fn().mockResolvedValue(0),
  }),
}));

// Mock React Native modules unavailable in Jest
jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'ios' },
}));
