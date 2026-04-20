// Learn more https://docs.expo.io/guides/customizing-metro
const fs = require('fs');
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const appRoot = __dirname;
const workspaceRoot = path.resolve(appRoot, '..');
const localNodeModules = path.resolve(appRoot, 'node_modules');
const rootNodeModules = path.resolve(workspaceRoot, 'node_modules');
const hasLocalReact = fs.existsSync(path.join(localNodeModules, 'react'));
const hasLocalReactNative = fs.existsSync(
  path.join(localNodeModules, 'react-native')
);
const appNodeModules =
  hasLocalReact && hasLocalReactNative ? localNodeModules : rootNodeModules;

const config = getDefaultConfig(appRoot);

function escapePathForRegex(filePath) {
  return filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blockPath(filePath) {
  return new RegExp(`${escapePathForRegex(filePath)}[/\\\\].*`);
}

const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

const duplicatePeerBlocks =
  appNodeModules === localNodeModules
    ? [
        path.join(rootNodeModules, 'react'),
        path.join(rootNodeModules, 'react-native'),
        path.join(rootNodeModules, 'react-native-reanimated'),
        path.join(rootNodeModules, 'react-native-worklets'),
      ].map(blockPath)
    : [];

config.resolver.blockList = [
  ...existingBlockList,
  ...duplicatePeerBlocks,
  ...[
    path.join(appRoot, 'android', '.gradle'),
    path.join(appRoot, 'android', 'app', 'build'),
    path.join(appRoot, 'android', 'build'),
    path.join(appRoot, 'ios', 'build'),
    path.join(appRoot, 'ios', 'Pods'),
    path.join(workspaceRoot, 'android', 'build'),
  ].map(blockPath),
];

config.resolver.nodeModulesPaths = [localNodeModules, rootNodeModules];

config.resolver.extraNodeModules = {
  expo: path.join(appNodeModules, 'expo'),
  react: path.join(appNodeModules, 'react'),
  'react-native': path.join(appNodeModules, 'react-native'),
  'react-native-reanimated': path.join(
    appNodeModules,
    'react-native-reanimated'
  ),
  'react-native-worklets': path.join(appNodeModules, 'react-native-worklets'),
  'react-native-viewport-metrics': workspaceRoot,
};

config.watchFolders = [workspaceRoot];

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
