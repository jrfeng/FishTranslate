import { build } from 'esbuild'
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src')
const out = join(root, 'dist')

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const appVersion = String(pkg.version || '0.0.0')

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

await build({
  entryPoints: [join(src, 'main.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'chrome110',
  charset: 'utf8',
  outfile: join(out, 'app.js'),
  logLevel: 'info',
  // 调试工具（宽度角标）只在带 FISH_DEBUG=1 构建时打进包里，release 包会整段剔除
  define: {
    __FISH_DEBUG__: JSON.stringify(process.env.FISH_DEBUG === '1'),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})

// 样式：src/styles/main.css 通过 @import 汇总，这里交给 esbuild 内联成一个 app.css
await build({
  entryPoints: [join(src, 'styles', 'main.css')],
  bundle: true,
  charset: 'utf8',
  // 主题 CSS 里用绝对路径引用 /assets、/styles，交给运行时解析
  external: ['/assets/*', '/styles/*'],
  outfile: join(out, 'app.css'),
  logLevel: 'info',
})

for (const file of ['index.html', 'boot-head.js', 'boot-body.js']) {
  await copyFile(join(src, file), join(out, file))
}

// 静态图片资源（空译文区的水印等）
await cp(join(src, 'assets'), join(out, 'assets'), { recursive: true })

// Web Awesome 的主题 CSS 带相对 @import，整目录拷过去保持结构
await cp(join(root, 'node_modules/@awesome.me/webawesome/dist/styles'), join(out, 'styles'), {
  recursive: true,
})

console.log('dist/ 已生成')
