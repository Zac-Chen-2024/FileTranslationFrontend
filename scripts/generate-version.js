const fs = require('fs');
const path = require('path');

// 读取 package.json 获取版本号
const packageJson = require('../package.json');

// 生成版本信息
const versionInfo = `// 自动生成的版本信息文件
// 每次构建时更新
export const VERSION = '${packageJson.version}';
export const BUILD_TIME = '${new Date().toISOString()}';
export const BUILD_NUMBER = ${Date.now()};
`;

// 写入文件
const versionFilePath = path.join(__dirname, '../src/version.js');
fs.writeFileSync(versionFilePath, versionInfo, 'utf8');

console.log('✅ 版本信息已生成:', {
  version: packageJson.version,
  buildTime: new Date().toISOString(),
  buildNumber: Date.now()
});
