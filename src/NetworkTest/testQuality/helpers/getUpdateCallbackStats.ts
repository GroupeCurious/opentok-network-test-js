import type { SubscriberStats } from '@opentok/client';
import { UpdateCallbackStats, CallbackTrackStats } from '../../types/callbacks';
import { DetailedPublisherStats } from '../types/stats';

const getUpdateCallbackStats = (
  subscriberStats: SubscriberStats,
  publisherStats: DetailedPublisherStats,
  phase: string,
): UpdateCallbackStats => {
  const { audio: audioTrackStats, video: videoTrackStats } = subscriberStats;

  const audioCallbackStats: CallbackTrackStats = {
    bytesSent: publisherStats.audioStats[0].byteSent ?? 0,
    bytesReceived: audioTrackStats.bytesReceived,
    packetsLost: audioTrackStats.packetsLost,
    packetsReceived: audioTrackStats.packetsReceived,
  };

  let videoCallbackStats: CallbackTrackStats & { frameRate: number } | undefined;

  if (phase === 'audio-video') {
    videoCallbackStats = {
      bytesSent: publisherStats.videoByteSent,
      bytesReceived: videoTrackStats?.bytesReceived ?? 0,
      packetsLost: videoTrackStats?.packetsLost ?? 0,
      packetsReceived: videoTrackStats?.packetsReceived ?? 0,
      frameRate: videoTrackStats?.frameRate ?? 0,
    };
  }

  return {
    phase,
    audio: audioCallbackStats,
    video: videoCallbackStats,
    timestamp: subscriberStats.timestamp,
  };
};

export default getUpdateCallbackStats;
