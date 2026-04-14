// Mock React Native modules unavailable in Jest
jest.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'ios' },
}));
