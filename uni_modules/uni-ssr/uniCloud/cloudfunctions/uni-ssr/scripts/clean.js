const fs = require('fs')
const path = require('path')

function getPathStat(filePath) {
  try {
    const stat = fs.statSync(filePath)
    return stat
  } catch (error) { }
}

function getType(val) {
  return Object.prototype.toString.call(val).slice(8, -1).toLowerCase()
}

function traverseNodeModules(nodeModulesPath, onModuleFound) {
  const stat = getPathStat(nodeModulesPath)
  if (!stat) {
    return
  }
  const children = fs.readdirSync(nodeModulesPath)
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const firstChar = child.charAt(0)
    if (firstChar === '.') {
      continue
    }
    const childPath = path.resolve(nodeModulesPath, child)
    const childStat = getPathStat(childPath)
    if (!childStat || !childStat.isDirectory()) {
      continue
    }
    if (firstChar !== '@') {
      const moduleName = child
      const modulePath = childPath
      onModuleFound(moduleName, modulePath)
      traverseNodeModules(path.resolve(modulePath, 'node_modules'), onModuleFound)
      continue
    }
    const orgChildren = fs.readdirSync(childPath)
    for (let j = 0; j < orgChildren.length; j++) {
      const orgChild = orgChildren[j];
      if (orgChild.charAt(0) === '.') {
        continue
      }
      const orgChildPath = path.resolve(childPath, orgChild)
      const orgChildStat = getPathStat(orgChildPath)
      if (!orgChildStat || !orgChildStat.isDirectory()) {
        continue
      }
      const moduleName = `${child}/${orgChild}`
      const modulePath = path.resolve(nodeModulesPath, moduleName)
      onModuleFound(moduleName, modulePath)
      traverseNodeModules(path.resolve(modulePath, 'node_modules'), onModuleFound)
    }
  }
}

const isDebug = false
const logger = new Proxy({}, {
  get: function (_, p) {
    if (isDebug) {
      return console[p].bind(console)
    }
    return function () { }
  }
})

function safeUnlink(filePath) {
  const fileStat = getPathStat(filePath)
  if (fileStat && fileStat.isFile()) {
    fs.unlinkSync(filePath)
  }
}

function safeRequire(filePath) {
  try {
    return require(filePath)
  } catch (error) {
    return {}
  }
}

// 将以下包替换为空包
const packageToReplace = [
  'esbuild',
  'esbuild-windows-arm64',
  'esbuild-windows-32',
  'esbuild-windows-64',
  'esbuild-android-arm64',
  'esbuild-darwin-arm64',
  'esbuild-darwin-64',
  'esbuild-freebsd-arm64',
  'esbuild-freebsd-64',
  'esbuild-linux-arm',
  'esbuild-linux-arm64',
  'esbuild-linux-32',
  'esbuild-linux-mips64le',
  'esbuild-linux-ppc64le',
  'esbuild-linux-64',
  'esbuild-netbsd-64',
  'esbuild-openbsd-64',
  'esbuild-sunos-64',
  '@dcloudio/uni-cli-shared',
  '@babel/helper-simple-access',
  '@babel/helper-split-export-declaration',
  '@babel/helper-validator-identifier',
  '@babel/helper-validator-option',
  '@babel/highlight',
  '@babel/parser',
  '@babel/template',
  '@babel/traverse',
  '@babel/types',
  '@babel/code-frame',
  '@babel/compat-data',
  '@babel/core',
  '@babel/generator',
  '@babel/helper-compilation-targets',
  '@babel/helper-environment-visitor',
  '@babel/helper-function-name',
  '@babel/helper-get-function-arity',
  '@babel/helper-hoist-variables',
  '@babel/helper-module-imports',
  '@babel/helper-module-transforms',
  '@babel/helpers',
  '@esbuild/linux-x64',
  '@esbuild/netbsd-x64',
  '@esbuild/darwin-arm64',
  '@esbuild/win32-x64',
  '@esbuild/linux-arm64',
  '@esbuild/darwin-x64',
  '@esbuild/android-arm',
  '@esbuild/win32-arm64',
  '@esbuild/linux-loong64',
  '@esbuild/linux-ppc64',
  '@esbuild/linux-mips64el',
  '@esbuild/linux-s390x',
  '@esbuild/linux-riscv64',
  '@esbuild/android-arm64',
  '@esbuild/freebsd-arm64',
  '@esbuild/win32-ia32',
  '@esbuild/freebsd-x64',
  '@esbuild/openbsd-x64',
  '@esbuild/sunos-x64',
  '@esbuild/linux-ia32',
  'browserslist',
  'csstype',
  'yaml',
  'caniuse-lite',
  'source-map',
  'sourcemap-codec',
  'source-map-js',
  'vue',
  '@vue/devtools-api',
  '@dcloud/types'
]

function replacePackage(moduleName, modulePath) {
  if (!packageToReplace.includes(moduleName)) {
    return
  }
  const packageJsonPath = path.resolve(modulePath, 'package.json')
  const {
    main
  } = safeRequire(packageJsonPath)
  traverseDir({
    dir: modulePath,
    ignore: ['package.json'],
    onFile: function ({
      filePath
    } = {}) {
      safeUnlink(filePath)
    }
  })
  if (moduleName === 'vue') {
    fs.writeFileSync(path.resolve(modulePath, 'server-renderer/index.js'), 'module.exports={}')
  }
  if (!main) {
    return
  }
  const mainPath = path.resolve(modulePath, main)
  fs.writeFileSync(mainPath, 'module.exports={}')
}


// [moduleName]: fileRelativePath[]
const fileToRemove = {
  '@vue/compiler-core': [
    'dist/compiler-core.cjs.js'
  ],
  '@vue/compiler-dom': [
    'dist/compiler-dom.esm-browser.prod.js',
    'dist/compiler-dom.global.js',
    'dist/compiler-dom.global.prod.js',
    'dist/compiler-dom.cjs.js',
    'dist/compiler-dom.esm-browser.js'
  ],
  '@vue/reactivity': [
    'dist/reactivity.esm-browser.prod.js',
    'dist/reactivity.global.js',
    'dist/reactivity.global.prod.js',
    'dist/reactivity.cjs.js',
    'dist/reactivity.esm-browser.js',
  ],
  '@vue/runtime-core': [
    'dist/runtime-core.cjs.js'
  ],
  '@vue/runtime-dom': [
    'dist/runtime-dom.global.js',
    'dist/runtime-dom.global.prod.js',
    'dist/runtime-dom.cjs.js',
    'dist/runtime-dom.esm-browser.js',
    'dist/runtime-dom.esm-browser.prod.js',
  ],
  '@vue/server-renderer': [
    'dist/server-renderer.cjs.js'
  ],
  '@vue/shared': [
    'dist/shared.cjs.js'
  ]
}

function removePackageFile(moduleName, modulePath) {
  const fileList = fileToRemove[moduleName]
  if (!fileList) {
    return
  }
  for (let i = 0; i < fileList.length; i++) {
    safeUnlink(path.resolve(modulePath, fileList[i]))
  }
}

// 移除以下内容
// package.json内browser对应的文件
// package.json内module对应的文件
function cleanPackage(moduleName, modulePath) {
  replacePackage(moduleName, modulePath)
  removePackageFile(moduleName, modulePath)
  const packageJsonPath = path.resolve(modulePath, 'package.json')
  const {
    browser,
    module: moduleEntry
  } = safeRequire(packageJsonPath)
  if (getType(moduleEntry) === 'string') {
    const moduleEntryPath = path.resolve(modulePath, moduleEntry)
    safeUnlink(moduleEntryPath)
  }
  if (getType(browser) === 'object') {
    for (const key in browser) {
      if (getType(browser[key]) !== 'string') {
        continue
      }
      const browserFilePath = path.resolve(modulePath, browser[key])
      safeUnlink(browserFilePath)
    }
  }
  cleanDir(modulePath)
}

function traverseDir({ dir, ignore, root, onFile } = {}) {
  const stat = getPathStat(dir)
  if (!stat || !stat.isDirectory()) {
    return
  }
  if (!root) {
    root = dir
  }
  const children = fs.readdirSync(dir)
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childPath = path.resolve(dir, child)
    const childStat = getPathStat(childPath)
    const relativePath = path.relative(root, childPath)
    if (!childStat) {
      continue
    }
    if (
      ignore && ignore.some(ignoreItem => {
        const type = getType(ignoreItem)
        switch (type) {
          case 'string':
            return ignoreItem === relativePath
          case 'regexp':
            return ignoreItem.test(relativePath)
          default:
            throw new Error(`invalid ignore: ${ignoreItem}`)
        }
      })
    ) {
      continue
    }
    if (childStat.isDirectory()) {
      traverseDir({
        dir: childPath,
        root,
        ignore,
        onFile
      })
      continue
    }
    if (childStat.isFile()) {
      onFile && onFile({
        fileName: child,
        relativePath,
        filePath: childPath
      })
    }
  }
}

// 移除以下内容
// *.ts
// *.md
// LICENSE
// ...
function cleanDir(dir) {
  traverseDir({
    dir,
    ignore: ['node_modules'],
    onFile: function ({
      fileName,
      filePath
    }) {
      if (/(.*\.es\.js|.*\.esm\.js|.*\.ts|.*\.mjs|.*\.esm-bundler\.js|.*\.esm-browser\.js|.*\.md|LICENSE|.*\.map)$/.test(fileName)) {
        safeUnlink(filePath)
      }
    }
  })
}

function getDirSize(dir) {
  let size = 0
  traverseDir({
    dir,
    onFile: function ({
      filePath
    } = {}) {
      size += getPathStat(filePath).size
    }
  })
  return size
}

function padStr(str, toLength) {
  const strLength = str.length
  if (strLength > toLength) {
    return str.slice(0, toLength - 3) + '...'
  }
  return str + ' '.repeat(toLength - strLength)
}

const sizeUnitList = ['B', 'KB', 'MB', 'GB']
let sizeMargin
function friendlySize(size) {
  if (!sizeMargin) {
    sizeMargin = []
    for (let i = 0; i < sizeUnitList.length; i++) {
      sizeMargin.push(Math.pow(1024, i + 1))
    }
  }
  for (let i = 0; i < sizeMargin.length; i++) {
    if (size < 1024) {
      return size.toFixed(2) + sizeUnitList[i]
    }
    size = size / 1024
  }
  return size.toFixed(2) + 'TB'
}

traverseNodeModules(path.resolve(__dirname, '../node_modules'), function (moduleName, modulePath) {
  cleanPackage(moduleName, modulePath)
})

if (isDebug) {
  const moduleInfoList = []
  traverseNodeModules(path.resolve(__dirname, '../node_modules'), function (moduleName, modulePath) {
    const size = getDirSize(modulePath)
    moduleInfoList.push({
      moduleName,
      modulePath,
      size,
      friendlySize: friendlySize(size)
    })

    moduleInfoList.sort((a, b) => {
      return b.size - a.size
    })
  })
  logger.log(moduleInfoList)
}