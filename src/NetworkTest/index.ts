/**
 * @module NetworkTest
 */

/**
* Define Network Connectivy class
*/

import packageJson from '../../package.json';
import { UpdateCallback, UpdateCallbackStats } from './types/callbacks';
import {
  testConnectivity,
  ConnectivityTestResults,
} from './testConnectivity';
import {
  testQuality,
  stopQualityTest,
  QualityTestResults,
} from './testQuality';
import {
  InvalidOnUpdateCallback,
} from './errors';

import OTKAnalytics from 'opentok-solutions-logging';
import { setProxyUrl } from '@opentok/client';

export interface NetworkTestOptions {
  audioOnly?: boolean;
  timeout?: number;
  audioSource?: string;
  videoSource?: string;
  initSessionOptions?: any;
  proxyServerUrl?: string;
  scalableVideo?: boolean;
  fullHd?: boolean;
}

export default class NetworkTest {
  credentials: { apiKey: string; sessionId: string; token: string };
  otLogging: OTKAnalytics;
  options?: NetworkTestOptions;

  /**
   * Returns an instance of NetworkConnectivity. See the "API reference" section of the
   * README.md file in the root of the opentok-network-test-js project for details.
   */
  constructor(credentials: { apiKey: string; sessionId: string; token: string }, options?: NetworkTestOptions) {
    const proxyServerUrl = this.validateProxyUrl(options);
    this.otLogging = this.startLoggingEngine(credentials.apiKey, credentials.sessionId, proxyServerUrl);
    this.credentials = credentials;
    this.options = options;
    this.setProxyUrl(proxyServerUrl);
  }

  private validateProxyUrl(options?: NetworkTestOptions): string {
    if (!options || !options.proxyServerUrl) {
      return '';
    }
    return options.proxyServerUrl;
  }

  private setProxyUrl(proxyServerUrl: string) {
    if (proxyServerUrl) {
      setProxyUrl(proxyServerUrl);
    }
  }

  private startLoggingEngine(apiKey: string, sessionId: string, proxyUrl: string): OTKAnalytics {
    return new OTKAnalytics({
      sessionId,
      partnerId: apiKey,
      source: window.location.href,
      clientVersion: `js-network-test-${packageJson.version}`,
      name: 'opentok-network-test',
      componentId: 'opentok-network-test',
    }, {
      proxyUrl,
    });
  }

  /**
   * This method checks to see if the client can connect to TokBox servers required for
   * using OpenTok.
   *
   * See the "API reference" section of the README.md file in the root of the
   * opentok-network-test-js project for details.
   */
  testConnectivity(): Promise<ConnectivityTestResults> {
    this.otLogging.logEvent({ action: 'testConnectivity', variation: 'Attempt' });
    return testConnectivity(this.credentials, this.otLogging, this.options);
  }

  /**
   * This function runs a test publisher and based on the measured video bitrate,
   * audio bitrate, and the audio packet loss for the published stream, it returns
   * results indicating the recommended supported publisher settings.
   *
   * See the "API reference" section of the README.md file in the root of the
   * opentok-network-test-js project for details.
   */
  testQuality(updateCallback?: UpdateCallback<UpdateCallbackStats>): Promise<QualityTestResults> {
    this.otLogging.logEvent({ action: 'testQuality', variation: 'Attempt' });
    if (updateCallback) {
      if (typeof updateCallback !== 'function' || updateCallback.length !== 1) {
        this.otLogging.logEvent({ action: 'testQuality', variation: 'Failure' });
        throw new InvalidOnUpdateCallback();
      }
    }
    return testQuality(this.credentials, this.otLogging, this.options, updateCallback);
  }

  /**
   * Stops the currently running test.
   *
   * See the "API reference" section of the README.md file in the root of the
   * opentok-network-test-js project for details.
   */
  stop() {
    stopQualityTest();
  }
}

export { ErrorNames } from './errors/types';
