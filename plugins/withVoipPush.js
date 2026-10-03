// iOS: PushKit(VoIP) 등록 + 수신 시 CallKit 보고를 네이티브 코드로 추가하는 Expo config plugin.
// ios/ 폴더는 prebuild 때 생성되므로 직접 수정하지 말고 이 플러그인을 고친다.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppDelegate, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILES = ['CallSNSVoip.h', 'CallSNSVoip.m'];

function withVoipSources(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const dir = path.join(cfg.modRequest.platformProjectRoot, projectName);
      for (const f of FILES) {
        fs.copyFileSync(path.join(__dirname, 'voip', f), path.join(dir, f));
      }
      // Swift AppDelegate 에서 CallSNSVoip 를 쓰기 위한 브리징 헤더 import
      const bridging = path.join(dir, `${projectName}-Bridging-Header.h`);
      const line = '#import "CallSNSVoip.h"';
      const current = fs.existsSync(bridging) ? fs.readFileSync(bridging, 'utf8') : '';
      if (!current.includes(line)) fs.writeFileSync(bridging, `${current.trimEnd()}\n${line}\n`);
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    // 헤더는 같은 폴더의 브리징 헤더가 import 하므로 컴파일 대상에는 .m 만 추가
    for (const f of FILES.filter((name) => name.endsWith('.m'))) {
      const filepath = `${projectName}/${f}`;
      if (!cfg.modResults.hasFile(filepath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath,
          groupName: projectName,
          project: cfg.modResults,
        });
      }
    }
    return cfg;
  });
}

function withVoipStart(config) {
  return withAppDelegate(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'swift') {
      throw new Error('withVoipPush: Swift AppDelegate 만 지원합니다');
    }
    if (contents.includes('CallSNSVoip.start()')) return cfg;
    const anchor = /(didFinishLaunchingWithOptions[^{]*\{\n)/;
    if (!anchor.test(contents)) {
      throw new Error('withVoipPush: AppDelegate 의 didFinishLaunchingWithOptions 를 찾지 못했습니다');
    }
    cfg.modResults.contents = contents.replace(
      anchor,
      '$1    // 앱이 꺼져 있어도 VoIP 푸시로 수신 화면을 띄우기 위해 시작 즉시 등록\n    CallSNSVoip.start()\n',
    );
    return cfg;
  });
}

module.exports = function withVoipPush(config) {
  return withVoipStart(withVoipSources(config));
};
