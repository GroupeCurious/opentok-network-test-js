/**
 * @module Test/Connectivity
 * @preferred
 *
 * Defines the methods required for the Connectivity Test Flow
 */

/**
 * Connectivity Test Flow
 */
import axios from 'axios';
/* tslint:disable */
import OTKAnalytics from 'opentok-solutions-logging';
/* tslint:enable */
import {
  NetworkTestOptions,
} from '../index';
import * as e from './errors';
import { OTErrorType, errorHasName } from '../errors/types';
import { mapErrors, FailureCase } from './errors/mapping';
import { getOr } from '../util';
import {
  type Publisher,
  type Session,
  type Subscriber,
  type Device,
  type OTError,
  type PublisherProperties,
  initSession,
  getDevices,
  initPublisher,
} from '@opentok/client';

type AV = 'audio' | 'video';
type CreateLocalPublisherResults = { publisher: Publisher };
type PublishToSessionResults = { session: Session } & CreateLocalPublisherResults;
type SubscribeToSessionResults = { subscriber: Subscriber } & PublishToSessionResults;
type DeviceMap = { [deviceId: string]: Device };
type AvailableDevices = { audio: DeviceMap; video: DeviceMap };

export type ConnectivityTestResults = {
  success: boolean;
  failedTests: FailureCase[];
};

/**
 * Disconnect from a session. Once disconnected, remove all session
 * event listeners and invoke the provided callback function.
 */
function disconnectFromSession(session: Session) {
  return new Promise<void>((resolve) => {
    session.on('sessionDisconnected', () => {
      session.off();
      resolve();
    });
    session.disconnect();
  });
}

/**
 * Clean subscriber objects before disconnecting from the session
 * @param session
 * @param subscriber
 */
function cleanSubscriber(session: Session, subscriber: Subscriber) {
  return new Promise<void>((resolve) => {
    subscriber.on('destroyed', () => {
      resolve();
    });
    if (!subscriber) {
      resolve();
    }
    session.unsubscribe(subscriber);
  });
}

function cleanPublisher(publisher: Publisher) {
  return new Promise<void>((resolve) => {
    publisher.on('destroyed', () => {
      resolve();
    });
    if (!publisher) {
      resolve();
    }
    publisher.destroy();
  });
}

/**
 * Attempt to connect to the OpenTok sessionope
 */
function connectToSession(
  { apiKey, sessionId, token }: { apiKey: string; sessionId: string; token: string },
  options?: NetworkTestOptions,
): Promise<Session> {
  return new Promise((resolve, reject) => {
    let sessionOptions: any = {};
    if (options && options.initSessionOptions) {
      sessionOptions = options.initSessionOptions;
    }

    const session = initSession(apiKey, sessionId, sessionOptions);
    session.connect(token, (error?: OTError) => {
      if (errorHasName(error, OTErrorType.OT_AUTHENTICATION_ERROR)) {
        reject(new e.ConnectToSessionTokenError());
      } else if (errorHasName(error, OTErrorType.OT_INVALID_SESSION_ID)) {
        reject(new e.ConnectToSessionSessionIdError());
      } else if (errorHasName(error, OTErrorType.OT_CONNECT_FAILED)) {
        reject(new e.ConnectToSessionNetworkError());
      } else if (errorHasName(error, OTErrorType.OT_INVALID_HTTP_STATUS)) {
        reject(new e.APIConnectivityError());
      } else if (error) {
        reject(new e.ConnectToSessionError());
      } else {
        resolve(session);
      }
    });
  });
}

/**
 * Ensure that audio and video devices are available
 */
function validateDevices(): Promise<AvailableDevices> {
  return new Promise((resolve, reject) => {
    getDevices((error?: OTError, devices: Device[] = []) => {

      if (error) {
        reject(new e.FailedToObtainMediaDevices());
      } else {

        const availableDevices: AvailableDevices = devices.reduce(
          (acc: AvailableDevices, device: Device) => {
            const type: AV = device.kind === 'audioInput' ? 'audio' : 'video';
            return { ...acc, [type]: { ...acc[type], [device.deviceId]: device } };
          },
          { audio: {}, video: {} },
        );

        if (!Object.keys(availableDevices.audio).length && !Object.keys(availableDevices.video).length) {
          reject(new e.FailedToObtainMediaDevices());
        } else {
          resolve(availableDevices);
        }
      }
    });
  });
}

/**
 * Create a local publisher object using any specified device options
 */
function checkCreateLocalPublisher(
  options?: NetworkTestOptions,
): Promise<CreateLocalPublisherResults> {
  return new Promise((resolve, reject) => {
    validateDevices()
      .then((availableDevices: AvailableDevices) => {
        const publisherDiv = document.createElement('div');
        publisherDiv.style.position = 'fixed';
        publisherDiv.style.bottom = '-1px';
        publisherDiv.style.width = '1px';
        publisherDiv.style.height = '1px';
        publisherDiv.style.opacity = '0.01';
        document.body.appendChild(publisherDiv);
        const publisherOptions: PublisherProperties = {
          width: '100%',
          height: '100%',
          insertMode: 'append',
          showControls: false,
          scalableVideo: false,
        };
        if (options && options.audioSource) {
          publisherOptions.audioSource = options.audioSource;
        }
        if (options && options.videoSource) {
          publisherOptions.videoSource = options.videoSource;
        }
        if (options && options.audioOnly) {
          publisherOptions.videoSource = null;
        }
        if (!Object.keys(availableDevices.audio).length) {
          publisherOptions.audioSource = null;
        }
        if (!Object.keys(availableDevices.video).length) {
          publisherOptions.videoSource = null;
        }
        if (options && options.scalableVideo) {
          publisherOptions.scalableVideo = options.scalableVideo;
        }
        const publisher = initPublisher(publisherDiv, publisherOptions, (error?: OTError) => {
          if (!error) {
            resolve({ publisher });
          } else {
            reject(new e.FailedToCreateLocalPublisher());
          }
        });
        publisher.on('streamCreated', () => {
          publisherDiv.style.visibility = 'hidden';
        });
      })
      .catch(reject);
  });
}

/**
 * Attempt to publish to the session
 */
function checkPublishToSession(
  session: Session,
  options?: NetworkTestOptions,
): Promise<PublishToSessionResults> {
  return new Promise((resolve, reject) => {
    const disconnectAndReject = (rejectError: Error) => {
      disconnectFromSession(session).then(() => {
        reject(rejectError);
      });
    };
    checkCreateLocalPublisher(options)
      .then(({ publisher }: CreateLocalPublisherResults) => {
        session.publish(publisher, (error?: OTError) => {
          if (error) {
            if (errorHasName(error, OTErrorType.NOT_CONNECTED)) {
              disconnectAndReject(new e.PublishToSessionNotConnectedError());
            } else if (errorHasName(error, OTErrorType.UNABLE_TO_PUBLISH)) {
              disconnectAndReject(
                new e.PublishToSessionPermissionOrTimeoutError());
            } else if (error) {
              disconnectAndReject(new e.PublishToSessionError());
            }
          } else {
            resolve({ ...{ session }, ...{ publisher } });
          }
        });
      }).catch((error: e.ConnectivityError) => {
        disconnectAndReject(error);
      });
  });
}

/**
 * Attempt to subscribe to our publisher
 */
function checkSubscribeToSession({ session, publisher }: PublishToSessionResults): Promise<SubscribeToSessionResults> {
  return new Promise((resolve, reject) => {
    const config = { testNetwork: true, audioVolume: 0 };
    const disconnectAndReject = (rejectError: Error) => {
      cleanPublisher(publisher)
        .then(() => disconnectFromSession(session))
        .then(() => {
          reject(rejectError);
        });
    };
    if (!publisher.stream) {
      disconnectAndReject(new e.SubscribeToSessionError());
    } else {
      const subscriberDiv = document.createElement('div');
      const subscriber = session.subscribe(publisher.stream, subscriberDiv, config, (error?: OTError) => {
        if (error) {
          disconnectAndReject(new e.SubscribeToSessionError());
        } else {
          resolve({ ...{ session }, ...{ publisher }, ...{ subscriber } });
        }
      });
    }
  });
}

/**
 * Attempt to connect to the tokbox client logging server
 */
function checkLoggingServer(options?: NetworkTestOptions, input?: SubscribeToSessionResults):
Promise<SubscribeToSessionResults> {
  return new Promise((resolve, reject) => {
    const loggingUrl = `${getOr('', 'properties.loggingURL', OT)}/logging/ClientEvent`; // https://hlg.tokbox.com/prod
    const url = options && options.proxyServerUrl &&
      `${options.proxyServerUrl}/${loggingUrl.replace('https://', '')}` || loggingUrl;
    const handleError = () => reject(new e.LoggingServerConnectionError());

    axios.post(url)
      .then(response => response.status === 200 && input ? resolve(input) : handleError())
      .catch(handleError);

  });
}

/**
 * This method checks to see if the client can connect to TokBox servers required for using OpenTok
 */
export function testConnectivity(
  credentials: { apiKey: string; sessionId: string; token: string },
  otLogging: OTKAnalytics,
  options?: NetworkTestOptions,
): Promise<ConnectivityTestResults> {
  return new Promise((resolve) => {

    const onSuccess = (flowResults: SubscribeToSessionResults) => {
      const results: ConnectivityTestResults = {
        success: true,
        failedTests: [],
      };
      otLogging.logEvent({ action: 'testConnectivity', variation: 'Success' });
      return cleanSubscriber(flowResults.session, flowResults.subscriber)
        .then(() => cleanPublisher(flowResults.publisher))
        .then(() => disconnectFromSession(flowResults.session))
        .then(() => resolve(results));
    };

    const onFailure = (error: Error) => {

      const handleResults = (...errors: e.ConnectivityError[]) => {
        /**
         * If we have a messaging server failure, we will also fail the media
         * server test by default.
         */
        const baseFailures: FailureCase[] = mapErrors(...errors);
        const messagingFailure = baseFailures.find(c => c.type === 'messaging');
        const failedTests = [
          ...baseFailures,
          ...messagingFailure ? mapErrors(new e.FailedMessagingServerTestError()) : [],
        ];

        const results = {
          failedTests,
          success: false,
        };
        otLogging.logEvent({ action: 'testConnectivity', variation: 'Success' });
        resolve(results);
      };

      /**
       * If we encounter an error before testing the connection to the logging server, let's perform
       * that test as well before returning results.
       */
      if (error.name === 'LoggingServerConnectionError') {
        handleResults(error);
      } else {
        checkLoggingServer(options)
          .then(() => handleResults(error))
          .catch((loggingError: e.LoggingServerConnectionError) => handleResults(error, loggingError));
      }
    };

    connectToSession(credentials, options)
      .then((session: Session) => checkPublishToSession(session, options))
      .then(checkSubscribeToSession)
      .then((results: SubscribeToSessionResults) => checkLoggingServer(options, results))
      .then(onSuccess)
      .catch(onFailure);
  });
}
