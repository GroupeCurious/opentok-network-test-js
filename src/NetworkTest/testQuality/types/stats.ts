export type AV = 'audio' | 'video';

export interface HasAudioVideo<A> {
  audio: A;
  video: A;
}

export interface Kbps { kbps: number }
export type KbpsMap = HasAudioVideo<Kbps[]>;
export type Bandwidth = HasAudioVideo<number>;

export interface SubscriberQualityStats {
  averageBitrate: number;
  packetLossRatio: number;
  frameRate?: number;
}

export interface QualityStats {
  averageAvailableOutgoingBitrate: number;
  averageBitrate: number;
  packetLossRatio: number;
  frameRate?: number;
}

export interface AverageStats {
  bitrate?: number;
  packetLossRatio?: number;
  supported?: boolean;
  reason?: string;
  qualityLimitationReason? : string;
  frameRate?: number;
  recommendedFrameRate?: number;
  recommendedResolution?: string;
  mos?: number;
}

export interface AverageStatsBase {
  simulcast : boolean;
  availableOutgoingBitrate: number;
  bitrate: number;
  packetLossRatio: number;
}

export interface DetailedPublisherStats {
  videoStats: {
    qualityLimitationReason: any;
    resolution: string;
    framerate: number;
    active: boolean;
    pliCount: number;
    nackCount: number;
    kbs: number;
    ssrc: number;
    byteSent: number | undefined;
    currentTimestamp: number;
  }[];
  audioStats: {
    kbs: number;
    ssrc: number;
    byteSent: number | undefined;
    currentTimestamp: number;
  }[];
  availableOutgoingBitrate: number;
  videoByteSent: number;
  videoKbsSent: number;
  simulcastEnabled: boolean;
  transportProtocol: string;
  currentRoundTripTime: number;
  timestamp: number;
}
