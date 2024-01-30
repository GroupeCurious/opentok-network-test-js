import type {
  Publisher,
  PublisherRtcStatsReportArr,
} from '@opentok/client';
import { DetailedPublisherStats } from '../types/stats';

export interface PreviousStreamStats {
  [ssrc: number]: {
    timestamp: number;
    bytesSent: number;
  };
}

export async function getPublisherStats(
  publisher: Publisher,
  previousStats: DetailedPublisherStats | undefined,
): Promise<DetailedPublisherStats | null> {

  if (typeof publisher.getRtcStatsReport !== 'function') {
    return null;
  }

  try {
    const publisherStatsReport = await publisher.getRtcStatsReport();
    return extractPublisherStats(publisherStatsReport, previousStats);
  } catch (error) {
    return null;
  }
}

const calculateAudioBitrate = (
  stats: RTCOutboundRtpStreamStats,
  previousStats: DetailedPublisherStats | undefined,
): number => {
  const previousSsrcFrameData = previousStats?.audioStats[0];
  if (!previousSsrcFrameData) {
    return 0;
  }

  const { currentTimestamp: previousTimestamp, byteSent: previousByteSent } = previousSsrcFrameData;
  const byteSent = (stats.bytesSent ?? 0) - (previousByteSent ?? 0);
  const timeDiff = (stats.timestamp - previousTimestamp) / 1000; // Convert to seconds

  return Math.round((byteSent * 8) / (1000 * timeDiff)); // Convert to bits per second
};

const calculateVideoBitrate = (
  stats: RTCOutboundRtpStreamStats,
  previousStats: DetailedPublisherStats | undefined,
): number => {
  const previousSsrcFrameData = previousStats?.videoStats.find(videoStats => videoStats.ssrc === stats.ssrc);
  if (!previousSsrcFrameData) {
    return 0;
  }

  const { currentTimestamp: previousTimestamp, byteSent: previousByteSent } = previousSsrcFrameData;
  const byteSent = (stats.bytesSent ?? 0) - (previousByteSent ?? 0);
  const timeDiff = (stats.timestamp - previousTimestamp) / 1000; // Convert to seconds

  return Math.round((byteSent * 8) / (1000 * timeDiff)); // Convert to kbit per second
};

const extractOutboundRtpStats = (
  outboundRtpStats: RTCOutboundRtpStreamStats[],
  previousStats?: DetailedPublisherStats,
) => {
  const videoStats = [];
  const audioStats = [];
  for (const stats of outboundRtpStats) {
    if (stats.kind === 'video') {
      const kbs = calculateVideoBitrate(stats, previousStats);
      const { ssrc, bytesSent: byteSent, timestamp: currentTimestamp } = stats;
      const baseStats = { kbs, ssrc, byteSent, currentTimestamp };
      videoStats.push({
        ...baseStats,
        qualityLimitationReason: (stats as any).qualityLimitationReason,
        resolution: `${stats.frameWidth ?? 0}x${stats.frameHeight ?? 0}`,
        framerate: stats.framesPerSecond ?? 0,
        active: false,
        pliCount: stats.pliCount ?? 0,
        nackCount: stats.nackCount ?? 0,
      });
    } else if (stats.kind === 'audio') {
      const kbs = calculateAudioBitrate(stats, previousStats);
      const { ssrc, bytesSent: byteSent, timestamp: currentTimestamp } = stats;
      const baseStats = { kbs, ssrc, byteSent, currentTimestamp };
      audioStats.push(baseStats);
    }
  }

  return { videoStats, audioStats };
};

const extractPublisherStats = (
  publisherRtcStatsReport?: PublisherRtcStatsReportArr,
  previousStats?: DetailedPublisherStats,
): DetailedPublisherStats | null => {
  if (!publisherRtcStatsReport) {
    return null;
  }

  const rtcStatsReport = publisherRtcStatsReport[0].rtcStatsReport as unknown as any[];

  const rtcStatsArray: any[] = Array.from(rtcStatsReport.values());

  const outboundRtpStats = rtcStatsArray.filter(
    stats => stats.type === 'outbound-rtp') as RTCOutboundRtpStreamStats[];
  const iceCandidatePairStats = rtcStatsArray.find(
    stats => stats.type === 'candidate-pair' && stats.nominated) as RTCIceCandidatePairStats;

  const findCandidateById = (type: string, id: string) => {
    return rtcStatsArray.find(stats => stats.type === type && stats.id === id);
  };

  const localCandidate = findCandidateById('local-candidate', iceCandidatePairStats.localCandidateId);

  const { videoStats, audioStats } = extractOutboundRtpStats(outboundRtpStats, previousStats);

  const availableOutgoingBitrate = iceCandidatePairStats?.availableOutgoingBitrate ?? -1;
  const currentRoundTripTime = iceCandidatePairStats?.currentRoundTripTime ?? -1;
  const videoKbsSent = videoStats.reduce((sum, stats) => sum + stats.kbs, 0);
  const videoByteSent = videoStats.reduce((sum, stats) => sum + (stats.byteSent ?? 0), 0);
  const simulcastEnabled = videoStats.length > 1;
  const transportProtocol = localCandidate?.protocol ?? 'N/A';
  const timestamp = localCandidate?.timestamp ?? 0;

  /**
  console.info("availableOutgoingBitrate: ", availableOutgoingBitrate);
  console.info("currentRoundTripTime: ", currentRoundTripTime);
  console.info("simulcastEnabled: ", simulcastEnabled);
  console.info("transportProtocol: ", transportProtocol);
  console.info("availableOutgoingBitrate: ", availableOutgoingBitrate);
  console.info("videoByteSent: ", videoByteSent);
  **/

  return {
    videoStats,
    audioStats,
    availableOutgoingBitrate,
    videoByteSent,
    videoKbsSent,
    simulcastEnabled,
    transportProtocol,
    currentRoundTripTime,
    timestamp,
  };
};
