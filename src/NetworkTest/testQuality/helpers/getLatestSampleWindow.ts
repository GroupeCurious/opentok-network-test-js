import config from './config';
import { getOr, last } from '../../util';
import { DetailedPublisherStats } from '../types/stats';

export default function getLatestSampleWindow(stats: DetailedPublisherStats[]): DetailedPublisherStats[] {
  const mostRecentTimestamp: number = getOr(0, 'timestamp', last(stats));
  const oldestAllowedTime: number = mostRecentTimestamp - config.steadyStateSampleWindow;
  return stats.filter((stat: DetailedPublisherStats) => stat.timestamp >= oldestAllowedTime);
}
