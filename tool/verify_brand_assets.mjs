#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function asset(path, width, height = width) {
  return { path, width, height };
}

const expectedHashBySize = new Map([
  ['20x20', '8b20c00f2966e1a4a321833134256401bc3f43528e899259197a1c832fb84a5d'],
  ['29x29', 'e200d41326425a723af97bd07264a5b0a990e7d7469d9f2dcfce1f2bb98ccec0'],
  ['32x32', '2e4a36d390240983cfc8515397294d87cae62a296bd0176be3c5688785da7713'],
  ['40x40', '0c4efa6d414357bbbb9495849475faee7f26aa04a3ae05df238e561b8de63a9c'],
  ['48x48', 'f3f49413a0362a9526232e7c3203fb82946d731e96d507a40a6fe8b9c55a2f1d'],
  ['58x58', 'e348beea64fe17bcaf84d56dd8f979541f3ec9053368ba8be42693c10a3a588f'],
  ['60x60', '97103811c775bbddfe41b1814b9c73b54db4f27a5ac895aced917197280cff33'],
  ['72x72', 'fd63e0b7561b307c35c67f94699ed8eb8d00e0c926f93e6dfec4d6d95bc6bca3'],
  ['76x76', 'adcac301d269363ac30a2c55086f3a4271cd02e5f20a165137215393014f1b00'],
  ['80x80', 'a61cf2e99616ded671b27b45fb54b4ffd09eadfe8540c28b5ba57cb5bc875bb2'],
  ['87x87', '2ab59e76abb5ef18d385ceaf826333340f5b6781cd2ec25b8dec0ddc2f8e2e33'],
  ['96x96', '92e4a8cceb7e71ed6134cf7aab6604ffc0bc2c9d3d7352dc12ead985b9d3da87'],
  ['120x120', 'cca0372e1c6d68b5ae3b5e03b6415cfa83a9bb885d84239738e4e6e50a011769'],
  ['144x144', '9e3a7a0f0f0a606df85252fe5a94809477345f63ced1c205804269b679cd6d56'],
  ['152x152', 'd479afa4acda3e651b263246ed75b21c5407c970b8d137e75081d16b2e8faacf'],
  ['167x167', 'f4cf047a8398a89bc8cb607e597754110ebbedcbc2937580a6b12e521e07f41b'],
  ['168x168', '9c7b2a23d310a14f6cf9eb457290fccc5294c0832f2929c45c03504e940fd042'],
  ['180x180', '501a26377714b2852f8c7e837a13c76f5dc6e31e7f683c172bf0ac94ab6faf27'],
  ['192x192', 'c99ee3ca99972ce20c711009d5b441ae778b0a680d978b4fcdf442ad3dc8b1fe'],
  ['288x288', 'b80a34b8e6b34431b095d12c36c3e984d701395f5edfd86df74b8f7ddb684d57'],
  ['336x336', '9f1745d965831fb3d9a4dbce08a3a7fa1c320d4cd8228ce0d1511e7671355214'],
  ['384x384', '528127b5b666a96cf87c386e68c9232763acd2db60298314729365a89bf6afb2'],
  ['504x504', '9b8ac6105879d3ceabce0a0405e3519901d4830682d8eea64cd6a5a79952adca'],
  ['512x512', '117e4547b5de671031213d579b91b5f110ad9042ad731353ea9de6d34cc99f01'],
  ['1024x1024', '7168ea38b286aa0d9e74a54f922ce4ea0ee1f4ce819e0a3d255e360ddcc459ec'],
]);

const assets = [
  asset('assets/images/shareittoo_app_icon_master.png', 1024),
  asset('web/favicon.png', 32),
  asset('web/icons/Icon-192.png', 192),
  asset('web/icons/Icon-512.png', 512),
  asset('web/icons/Icon-maskable-192.png', 192),
  asset('web/icons/Icon-maskable-512.png', 512),
  asset('android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48),
  asset('android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72),
  asset('android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96),
  asset('android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144),
  asset('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192),
  asset('android/app/src/main/res/mipmap-mdpi/ic_launcher_v2.png', 48),
  asset('android/app/src/main/res/mipmap-hdpi/ic_launcher_v2.png', 72),
  asset('android/app/src/main/res/mipmap-xhdpi/ic_launcher_v2.png', 96),
  asset('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_v2.png', 144),
  asset('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_v2.png', 192),
  asset('android/app/src/main/res/mipmap-mdpi/launch_logo.png', 96),
  asset('android/app/src/main/res/mipmap-hdpi/launch_logo.png', 144),
  asset('android/app/src/main/res/mipmap-xhdpi/launch_logo.png', 192),
  asset('android/app/src/main/res/mipmap-xxhdpi/launch_logo.png', 288),
  asset('android/app/src/main/res/mipmap-xxxhdpi/launch_logo.png', 384),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png', 20),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png', 40),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png', 60),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png', 29),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png', 58),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png', 87),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png', 40),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png', 80),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png', 120),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png', 120),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png', 180),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png', 76),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png', 152),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', 167),
  asset('ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', 1024),
  asset('ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png', 168),
  asset('ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png', 336),
  asset('ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png', 504),
];

const notificationAssets = [
  { ...asset('android/app/src/main/res/drawable-mdpi/ic_stat_shareittoo_v2.png', 24), sha256: 'fbcade666cd7c4e6996e4445a6cbf54a9e43ade230ccfca70fffd304cf1d5103' },
  { ...asset('android/app/src/main/res/drawable-hdpi/ic_stat_shareittoo_v2.png', 36), sha256: '9d1871f608ad21bed1fcc9092b340a1f650ad88b10b7506e2d1abf204cf2cb61' },
  { ...asset('android/app/src/main/res/drawable-xhdpi/ic_stat_shareittoo_v2.png', 48), sha256: '2cb1c2b86e5b380c39a2967b14b7e05a4821643d0ff0e044bb5b8a8b5fc2aefa' },
  { ...asset('android/app/src/main/res/drawable-xxhdpi/ic_stat_shareittoo_v2.png', 72), sha256: '8cbf38b9ae3c30286cfc7034612585a4db8b7a57d43e6e817fe3806b479fc016' },
  { ...asset('android/app/src/main/res/drawable-xxxhdpi/ic_stat_shareittoo_v2.png', 96), sha256: 'a108a91a8252b1c0ff9f0f9d9391bbaae62e1a663694a71fc79d4dc4f52f96cd' },
];

const adaptiveLauncherAssets = [
  { ...asset('android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png', 108), sha256: '54a64f48940f0665ab6e0d4a852d3178289a0314cddf772b08ca972fcdef6573' },
  { ...asset('android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png', 162), sha256: 'ccb98a19583205f2da4716db9b863940a4729b9639526ff1b9ac6fc2c8e9db50' },
  { ...asset('android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png', 216), sha256: '1d48159341444549b7ea22beacb4c4c6afa3a9efc848f166b71265b6e99d6356' },
  { ...asset('android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png', 324), sha256: '32439c0e31a21442b57c9eeb57342c80b656948a453aa671230acbc60a5fa9a1' },
  { ...asset('android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png', 432), sha256: '81a3334cced1a60e37e8636e6081b743260cfb787866a770525e01a0505c281d' },
];

function inspectPng(relativePath) {
  const contents = readFileSync(`${root}${relativePath}`);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!contents.subarray(0, 8).equals(signature)) {
    fail(`${relativePath} is not a PNG file.`);
  }

  if (contents.toString('ascii', 12, 16) !== 'IHDR') {
    fail(`${relativePath} has no leading IHDR chunk.`);
  }

  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
    bitDepth: contents[24],
    colorType: contents[25],
    interlace: contents[28],
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

for (const entry of assets) {
  const png = inspectPng(entry.path);
  const key = `${entry.width}x${entry.height}`;
  const expectedHash = expectedHashBySize.get(key);

  if (png.width !== entry.width || png.height !== entry.height) {
    fail(`${entry.path} must be ${key}, found ${png.width}x${png.height}.`);
  }
  if (png.bitDepth !== 8 || png.colorType !== 2 || png.interlace !== 0) {
    fail(`${entry.path} must be an opaque, non-interlaced 8-bit RGB PNG.`);
  }
  if (!expectedHash || png.sha256 !== expectedHash) {
    fail(`${entry.path} is not the approved white ShareItToo master rendering for ${key}.`);
  }
}

for (const entry of notificationAssets) {
  const png = inspectPng(entry.path);
  if (png.width !== entry.width || png.height !== entry.height) {
    fail(`${entry.path} must be ${entry.width}x${entry.height}.`);
  }
  if (png.bitDepth !== 8 || png.colorType !== 6 || png.interlace !== 0) {
    fail(`${entry.path} must be a transparent, non-interlaced 8-bit RGBA PNG.`);
  }
  if (png.sha256 !== entry.sha256) {
    fail(`${entry.path} is not the approved ShareItToo notification silhouette.`);
  }
}

for (const entry of adaptiveLauncherAssets) {
  const png = inspectPng(entry.path);
  if (png.width !== entry.width || png.height !== entry.height) {
    fail(`${entry.path} must be ${entry.width}x${entry.height}.`);
  }
  if (png.bitDepth !== 8 || png.colorType !== 6 || png.interlace !== 0) {
    fail(`${entry.path} must be a transparent, non-interlaced 8-bit RGBA PNG.`);
  }
  if (png.sha256 !== entry.sha256) {
    fail(`${entry.path} is not the approved ShareItToo adaptive launcher foreground.`);
  }
}

const manifest = JSON.parse(readFileSync(`${root}web/manifest.json`, 'utf8'));
if (manifest.background_color !== '#FFFFFF') {
  fail('web/manifest.json must use a white PWA background_color.');
}
if (manifest.theme_color !== '#0EA5E9') {
  fail('web/manifest.json must use the ShareItToo primary theme color.');
}

const expectedWebIcons = new Map([
  ['icons/Icon-192.png', '192x192:any'],
  ['icons/Icon-512.png', '512x512:any'],
  ['icons/Icon-maskable-192.png', '192x192:maskable'],
  ['icons/Icon-maskable-512.png', '512x512:maskable'],
]);
for (const icon of manifest.icons ?? []) {
  const key = `${icon.sizes}:${icon.purpose ?? 'any'}`;
  if (icon.type !== 'image/png' || expectedWebIcons.get(icon.src) !== key) {
    fail(`Unexpected PWA icon declaration for ${icon.src ?? '<missing src>'}.`);
  }
  expectedWebIcons.delete(icon.src);
}
if (expectedWebIcons.size !== 0) {
  fail(`Missing PWA icon declarations: ${[...expectedWebIcons.keys()].join(', ')}.`);
}

const androidColors = readFileSync(
  `${root}android/app/src/main/res/values/colors.xml`,
  'utf8',
);
if (!androidColors.includes('<color name="shareittoo_launch_background">#FFFFFF</color>')) {
  fail('Android launch background must remain white.');
}
if (!androidColors.includes('<color name="shareittoo_notification_accent">#00A9E0</color>')) {
  fail('Android notification accent must use the ShareItToo blue.');
}
const adaptiveBackground = readFileSync(
  `${root}android/app/src/main/res/values/ic_launcher_background.xml`,
  'utf8',
);
if (!adaptiveBackground.includes('<color name="ic_launcher_background">#FFFFFF</color>')) {
  fail('Android adaptive launcher background must remain white.');
}

const androidManifest = readFileSync(
  `${root}android/app/src/main/AndroidManifest.xml`,
  'utf8',
);
if (!androidManifest.includes('com.google.firebase.messaging.default_notification_icon')
    || !androidManifest.includes('android:resource="@drawable/ic_stat_shareittoo_v2"')) {
  fail('Android Firebase notifications must use the approved ShareItToo status icon.');
}
if (!androidManifest.includes('com.google.firebase.messaging.default_notification_color')
    || !androidManifest.includes('android:resource="@color/shareittoo_notification_accent"')) {
  fail('Android Firebase notifications must use the ShareItToo accent color.');
}
if (!androidManifest.includes('android:icon="@mipmap/ic_launcher_v2"')
    || !androidManifest.includes('android:roundIcon="@mipmap/ic_launcher_round_v2"')) {
  fail('Android must declare the cache-busted approved adaptive launcher icons.');
}

for (const adaptiveIcon of [
  'ic_launcher.xml',
  'ic_launcher_round.xml',
  'ic_launcher_v2.xml',
  'ic_launcher_round_v2.xml',
]) {
  const contents = readFileSync(
    `${root}android/app/src/main/res/mipmap-anydpi-v26/${adaptiveIcon}`,
    'utf8',
  );
  if (!contents.includes('@color/ic_launcher_background')
      || !contents.includes('@drawable/ic_launcher_foreground')) {
    fail(`${adaptiveIcon} must use the approved white background and ShareItToo foreground.`);
  }
}

const iosLaunchScreen = readFileSync(
  `${root}ios/Runner/Base.lproj/LaunchScreen.storyboard`,
  'utf8',
);
if (!iosLaunchScreen.includes('<color key="backgroundColor" white="1" alpha="1"')) {
  fail('iOS launch background must remain opaque white.');
}

console.log(`Brand asset verification passed for ${assets.length + notificationAssets.length + adaptiveLauncherAssets.length} PNG files.`);
