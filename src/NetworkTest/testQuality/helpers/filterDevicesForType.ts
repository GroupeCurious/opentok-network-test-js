import * as e from '../../testQuality/errors';
import { type Device, getDevices } from '@opentok/client';

export type InputDeviceType = 'audioInput' | 'videoInput';

export default function filterDevicesForType(type: InputDeviceType) {
  return new Promise<Device[]>((resolve, reject) => {
    getDevices((error?: OT.OTError, devices: Device[] = []) => {
      if (error) {
        reject(new e.FailedToObtainMediaDevices());
      } else {
        const deviceList = devices.filter((device: Device) => device.kind === type);
        if (deviceList.length !== 0) {
          resolve(deviceList);
        } else if (type === 'videoInput') {
          reject(new e.NoVideoCaptureDevicesError());
        } else if (type === 'audioInput') {
          reject(new e.NoAudioCaptureDevicesError());
        }
      }
    });
  });
}
