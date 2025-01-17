/* tslint: disable */

import * as OTClient from '@opentok/client';
import {
  primary as sessionCredentials,
  faultyLogging as badLoggingCredentials,
} from './credentials.json';
import {
  NetworkTestError,
  InvalidOnUpdateCallback,
} from '../src/NetworkTest/errors';
import { ConnectivityError } from '../src/NetworkTest/testConnectivity/errors';
import NetworkTest, { ErrorNames } from '../src/NetworkTest';
import { ConnectivityTestResults } from '../src/NetworkTest/testConnectivity/index';
import { QualityTestError } from '../src/NetworkTest/testQuality/errors/index';
import { expect } from 'jasmine-matchers';

type CustomMatcher = jasmine.CustomMatcher;

const badCredentials = { apiKey: '1234', sessionId: '1234', token: '1234' };
const networkTest = new NetworkTest(sessionCredentials);
const networkTestWithOptions = new NetworkTest(sessionCredentials, {
  audioOnly: true,
  timeout: 5000,
});
const badCredentialsNetworkTest = new NetworkTest(badCredentials);
const validOnUpdateCallback = (stats: OT.SubscriberStats) => stats;

const customMatchers: jasmine.CustomMatcherFactories = {
  toBeInstanceOf: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = actual instanceof expected;
        const message: string = pass ? '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
  toBeABoolean: (): CustomMatcher => {
    return {
      compare: (actual: any, expected: any): jasmine.CustomMatcherResult => {
        const pass: boolean = typeof actual === 'boolean';
        const message: string = pass ? '' : `Expected ${actual} to be an instance of ${expected}`;
        return { pass, message };
      },
    };
  },
};

describe('NetworkTest', () => {

  beforeAll(() => {
    jasmine.addMatchers(customMatchers);
  });

  afterEach((done) => {
    if (networkTest) {
      networkTest.stop();
    }
    // A bit of a hack. But this prevents tests from failing if a previous test's Session didn't disconnect:
    setTimeout(() => { done(); }, 1000);
  });

  it('its constructor requires OT and valid session credentials', () => {
    expect(new NetworkTest(sessionCredentials)).toBeInstanceOf(NetworkTest);
  });

  it('it contains a valid ErrorNames module', () => {
    expect(ErrorNames.MISSING_OPENTOK_INSTANCE).to.be('MissingOpenTokInstanceError');
  });

  describe('Connectivity Test', () => {
    const testConnectFailure = (errorName, expectedType) => {
      return new Promise<void>((resolve) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((apiKey, sessionId) => {
          const session = realInitSession(apiKey, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = errorName;
            callback(error);
          });
          return session;
        });
        const netTest = new NetworkTest(sessionCredentials);
        netTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === expectedType)) {
              resolve();
            }
          });
      });
    };

    describe('Test Results', () => {
      it('should contain success and failedTests properties', (done) => {
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBeABoolean;
            expect(results.failedTests).toBeInstanceOf(Array);
            done();
          });
      }, 10000);

      it('should return a failed test case if invalid session credentials are used', (done) => {
        const validateResults = (results: ConnectivityTestResults) => {
          expect(results.success).toBe(false);
          expect(results.failedTests).toBeInstanceOf(Array);
          const [initialFailure, secondaryFailure] = results.failedTests;
          expect(initialFailure.type).toBe('messaging');
          expect(initialFailure.error.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
          expect(secondaryFailure.type).toBe('media');
          expect(secondaryFailure.error.name).toBe(ErrorNames.FAILED_MESSAGING_SERVER_TEST);
        };

        const validateError = (error?: ConnectivityError) => {
          expect(error).toBeUndefined();
        };

        badCredentialsNetworkTest.testConnectivity()
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      });

      it('should result in a failed test if the logging server cannot be reached', (done) => {
        const badLoggingOT = {
          ...OTClient,
          ...{
            properties: {
              ...OTClient.properties,
              loggingURL: OTClient.properties.loggingURL.replace('tokbox', 'bad-tokbox'),
            },
          },
        };
        const badLoggingNetworkTest = new NetworkTest(badLoggingOT, badLoggingCredentials);
        badLoggingNetworkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'logging')) {
              done();
            }
          });
      }, 10000);

      it('should result in a failed test if the API server cannot be reached', (done) => {
        testConnectFailure('OT_CONNECT_FAILED', 'api').then(done);
      }, 1000);

      it('results in a failed test when session.connect() gets an invalid HTTP status', (done) => {
        testConnectFailure('OT_INVALID_HTTP_STATUS', 'api').then(done);
      }, 1000);

      it('results in a failed test if session.connect() gets an authentication error', (done) => {
        testConnectFailure('OT_AUTHENTICATION_ERROR', 'messaging').then(done);
      }, 1000);
      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 10000);
      it('results in a failed test if there are no cameras or mics', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(null, []);
        });
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 10000);
      it('results in a failed test if session.connect() gets an authentication error', (done) => {
        testConnectFailure('OT_AUTHENTICATION_ERROR', 'messaging').then(done);
      }, 1000);
      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        spyOn(OT, 'initPublisher').and.callFake((target, options, callback) => {
          callback(new Error());
        });
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'OpenTok.js')) {
              done();
            }
          });
      }, 10000);
      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((apiKey, sessionId) => {
          const session = realInitSession(apiKey, sessionId);
          spyOn(session, 'subscribe').and.callFake((stream, target, config, callback) => {
            const error = new Error();
            callback(error);
          });
          return session;
        });
        networkTest.testConnectivity()
          .then((results: ConnectivityTestResults) => {
            expect(results.success).toBe(false);
            expect(results.failedTests).toBeInstanceOf(Array);
            if (results.failedTests.find(f => f.type === 'media')) {
              done();
            }
          });
      }, 10000);
    });

    describe('Quality Test', () => {
      const validateResultsUndefined = (results: QualityTestResults) => {
        expect(results).toBe(undefined);
      };

      const validateUnsupportedBrowserError = (error?: QualityTestError) => {
        expect(error.name).toBe(ErrorNames.UNSUPPORTED_BROWSER);
      };

      const testConnectFailure = (otErrorName, netTestErrorName) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((apiKey, sessionId) => {
          const session = realInitSession(apiKey, sessionId);
          spyOn(session, 'connect').and.callFake((token, callback) => {
            const error = new Error();
            error.name = otErrorName;
            callback(error);
          });
          return session;
        });

        const validateResults = (results: QualityTestResults) => {
          expect(results).toBe(undefined);
        };

        const validateError = (error?: QualityTestError) => {
          expect(error.name).toBe(netTestErrorName);
        };

        networkTest.testQuality(null)
          .then(validateResults)
          .catch(validateError);
      };

      const validateStandardResults = (results: QualityTestResults) => {
        const { audio, video } = results;

        expect(audio.bitrate).toEqual(jasmine.any(Number));
        expect(audio.supported).toEqual(jasmine.any(Boolean));
        expect(audio.reason || '').toEqual(jasmine.any(String));
        expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
        expect(audio.mos).toEqual(jasmine.any(Number));

        expect(video.supported).toEqual(jasmine.any(Boolean));
        if (video.supported) {
          expect(video.bitrate).toEqual(jasmine.any(Number));
          expect(video.packetLossRatio).toEqual(jasmine.any(Number));
          expect(video.frameRate).toEqual(jasmine.any(Number));
          expect(video.recommendedResolution).toEqual(jasmine.any(String));
          expect(video.recommendedFrameRate).toEqual(jasmine.any(Number));
          expect(video.mos).toEqual(jasmine.any(Number));
        } else {
          expect(video.reason).toEqual(jasmine.any(String));
        }
      };

      it('validates its onUpdate callback', () => {
        // eslint-disable-next-line
        expect(() => networkTest.testQuality('bad-callback').toThrow(new InvalidOnUpdateCallback()));
        expect(() => networkTest.testConnectivity(validOnUpdateCallback)
          .not.toThrowError(NetworkTestError));
      });

      it('should return an error if invalid session credentials are used', (done) => {
        const validateResults = (results: QualityTestResults) => {
          expect(results).toBe(undefined);
        };

        const validateError = (error?: QualityTestError) => {
          expect(error.name).toBe(ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
        };

        badCredentialsNetworkTest.testQuality(null)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      });

      it('should return an error if session.connect() gets an authentication error', () => {
        testConnectFailure('OT_AUTHENTICATION_ERROR', ErrorNames.CONNECT_TO_SESSION_TOKEN_ERROR);
      });

      it('should return an error if session.connect() gets a session ID error', () => {
        testConnectFailure('OT_INVALID_SESSION_ID', ErrorNames.CONNECT_TO_SESSION_ID_ERROR);
      });

      it('should return an error if session.connect() gets a network error', () => {
        testConnectFailure('OT_CONNECT_FAILED', ErrorNames.CONNECT_TO_SESSION_NETWORK_ERROR);
      });

      it('results in a failed test if OT.getDevices() returns an error', (done) => {
        spyOn(OT, 'getDevices').and.callFake((callback) => {
          callback(new Error());
        });
        networkTest.testQuality()
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.FAILED_TO_OBTAIN_MEDIA_DEVICES);
            done();
          });
      }, 10000);

      it('results in a failed test if there are no mics', (done) => {
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyVideoDevices = devices?.filter(device => device.kind !== 'audioInput');
            callbackFn(error, onlyVideoDevices);
          });
        });
        networkTest.testQuality()
          .catch((error?: QualityTestError) => {
            expect(error?.name).toBe(ErrorNames.NO_AUDIO_CAPTURE_DEVICES);
            done();
          });
      }, 10000);

      it('should return valid test results or an error', (done) => {
        const validateError = (error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.QUALITY_TEST_ERROR);
        };

        const onUpdate = (stats: Stats) => validOnUpdateCallback(stats);

        networkTest.testQuality(onUpdate)
          .then(validateStandardResults)
          .catch(validateError)
          .finally(done);
      }, 40000);

      it('should run a valid test or error when give audiOnly and timeout options', (done) => {
        const validateResults = (results: QualityTestResults) => {
          const { audio, video } = results;

          expect(audio.bitrate).toEqual(jasmine.any(Number));
          expect(audio.supported).toEqual(jasmine.any(Boolean));
          expect(audio.reason || '').toEqual(jasmine.any(String));
          expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
          expect(audio.mos).toEqual(jasmine.any(Number));

          expect(video.supported).toEqual(false);
        };

        const validateError = (error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.QUALITY_TEST_ERROR);
        };

        const onUpdate = (stats: Stats) => validOnUpdateCallback(stats);

        networkTestWithOptions.testQuality(onUpdate)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      }, 10000);

      it('should stop the quality test when you call the stop() method', (done) => {
        const validateError = (error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.QUALITY_TEST_ERROR);
        };

        const onUpdate = (stats: Stats) => {
          validOnUpdateCallback(stats);
          networkTest.stop(); // The test will wait for adequate stats before stopping
        };

        networkTest.testQuality(onUpdate)
          .then(validateStandardResults)
          .catch(validateError)
          .finally(done);
      }, 10000);

      it('should return valid test results or an error when there is no camera', (done) => {
        const realOTGetDevices = OT.getDevices;
        spyOn(OT, 'getDevices').and.callFake((callbackFn) => {
          realOTGetDevices((error, devices) => {
            const onlyAudioDevices = devices?.filter(device => device.kind !== 'videoInput');
            callbackFn(error, onlyAudioDevices);
          });
        });

        const validateResults = (results: QualityTestResults) => {
          const { audio, video } = results;
          expect(audio.bitrate).toEqual(jasmine.any(Number));
          expect(audio.supported).toEqual(jasmine.any(Boolean));
          expect(audio.packetLossRatio).toEqual(jasmine.any(Number));
          expect(audio.mos).toEqual(jasmine.any(Number));

          expect(video.supported).toEqual(false);
          expect(video.reason).toEqual('No camera was found.');
        };

        const validateError = (error?: QualityTestError) => {
          expect(error).toBe(QualityTestError);
        };

        const onUpdate = (stats: Stats) => validOnUpdateCallback(stats);

        networkTest.testQuality(onUpdate)
          .then(validateResults)
          .catch(validateError)
          .finally(done);
      }, 10000);

      it('should return an error if the window.navigator is undefined', () => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue(undefined);
        networkTest.testQuality(null)
          .then(validateResultsUndefined)
          .catch(validateUnsupportedBrowserError);
      });

      it('should return an unsupported browser error if the browser is an older version of Edge', () => {
        spyOnProperty(window, 'navigator', 'get').and.returnValue({
          mediaDevices: {},
          webkitGetUserMedia: null,
          mozGetUserMedia: null,
          userAgent: 'Edge/12.10240',
        });
        networkTest.testQuality(null)
          .then(validateResultsUndefined)
          .catch(validateUnsupportedBrowserError);
      }, 10000);

      it('should run the test if the browser is a Chromium-based version of Edge', (done) => {
        const mozGetUserMedia = navigator.mozGetUserMedia;
        const webkitGetUserMedia = navigator.webkitGetUserMedia;
        navigator.mozGetUserMedia = null;
        navigator.webkitGetUserMedia = {};
        spyOnProperty(window.navigator, 'userAgent', 'get').and.returnValue('Edg');
        networkTestWithOptions.testQuality()
          .then(() => {
            navigator.mozGetUserMedia = mozGetUserMedia;
            navigator.webkitGetUserMedia = webkitGetUserMedia;
            done();
          });
      }, 10000);

      it('results in a failed test if OT.initPublisher() returns an error', (done) => {
        spyOn(OT, 'initPublisher').and.callFake((target, options, callback) => {
          callback(new Error());
        });
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.INIT_PUBLISHER_ERROR);
          done();
        });
      }, 10000);

      it('results in a failed test if Session.subscribe() returns an error', (done) => {
        const realInitSession = OT.initSession;
        spyOn(OT, 'initSession').and.callFake((apiKey, sessionId) => {
          const session = realInitSession(apiKey, sessionId);
          spyOn(session, 'subscribe').and.callFake((stream, target, config, callback) => {
            const error = new Error();
            callback(error);
          });
          return session;
        });
        networkTest.testQuality().catch((error?: QualityTestError) => {
          expect(error?.name).toBe(ErrorNames.SUBSCRIBE_TO_SESSION_ERROR);
          done();
        });
      }, 10000);
    });
  });
});
