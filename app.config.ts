/// <reference types="node" />
import fs from 'node:fs';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json 위에 환경에 따라 달라지는 값만 덧붙인다.
 *  - google-services.json (Firebase, Android 수신 전화 FCM) 은 커밋하지 않으므로 있을 때만 연결
 *  - EAS projectId (Expo 푸시 토큰) 는 EAS_PROJECT_ID 환경변수 또는 `eas init` 이 넣은 값
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = fs.existsSync('./google-services.json') ? './google-services.json' : undefined;
  const projectId = process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId;
  return {
    ...config,
    name: config.name ?? 'CallSNS',
    slug: config.slug ?? 'callsns',
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}) },
  };
};
