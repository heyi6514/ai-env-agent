// pm2 进程配置：GitHub Actions 在服务器上执行 `pm2 reload ecosystem.config.cjs` 使用
// 用 .cjs 后缀：项目 package.json 声明了 "type": "module"，.js 文件会被当 ESM 解析，
// 而 pm2 的配置文件必须走 CommonJS 的 module.exports
module.exports = {
  apps: [
    {
      name: 'ai-env-agent',
      cwd: __dirname,
      // 生产直接用仓库内 tsx 跑 TS 入口，不为部署引入额外构建步骤。
      // 注意必须指向真实 JS 入口 dist/cli.mjs——.bin/tsx 是 pnpm 生成的 shell wrapper，
      // pm2 fork 模式会用 node 解释它，shell 语法直接 SyntaxError
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server/index.ts',
      env: {
        NODE_ENV: 'production', // index.ts 依赖此标记开启 dist 静态托管 + SPA fallback
        PORT: 3000,
      },
      // 内存超限自动重启兜底（SSE/上传场景防泄漏拖垮服务器）
      max_memory_restart: '512M',
    },
  ],
}
