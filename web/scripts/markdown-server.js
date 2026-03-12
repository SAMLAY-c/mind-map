const express = require('express')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const port = 3457

// 使用 CDN 加载 simple-mind-map，不内嵌任何代码
const CDN_URL = 'https://cdn.jsdelivr.net/npm/simple-mind-map@0.14.0-fix.1/dist/simpleMindMap.umd.min.js'

// 生成随机文件名
const generateRandomFileName = () => {
  return crypto.randomBytes(16).toString('hex') + '.html'
}

// 主题配置（映射 simple-mind-map 的主题）
const themeMap = {
  default: 'classic',      // 默认主题
  classic: 'classic',       // 经典主题
  minimal: 'fresh',         // 简约主题（对应 fresh 主题）
}

// 解析 Markdown 为 simple-mind-map 格式
function parseMarkdown(markdown) {
  const lines = markdown.split('\n').filter(line => line.trim())

  if (lines.length === 0) {
    return {
      data: { text: '思维导图' },
      children: []
    }
  }

  // 将每一行转换为节点
  const parsedLines = []

  for (const line of lines) {
    // 标题：# ## ### 等
    const headingMatch = line.match(/^(#+)\s+(.+)$/)
    if (headingMatch) {
      const hashes = headingMatch[1]
      const text = headingMatch[2].trim()
      parsedLines.push({
        level: hashes.length,
        text: text,
        type: 'heading'
      })
      continue
    }

    // 列表：- * + 或 1. 2. 3. 等
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const indent = listMatch[1]
      const text = listMatch[3].trim()
      const indentLevel = Math.floor(indent.length / 2)
      parsedLines.push({
        level: 999, // 临时值
        text: text,
        type: 'list',
        indent: indent.length
      })
      continue
    }
  }

  if (parsedLines.length === 0) {
    return {
      data: { text: '思维导图' },
      children: []
    }
  }

  // 后处理：计算列表的实际层级
  let currentBaseLevel = 1
  for (let i = 0; i < parsedLines.length; i++) {
    const item = parsedLines[i]
    if (item.type === 'heading') {
      currentBaseLevel = item.level
    } else if (item.type === 'list' && item.level === 999) {
      const indentLevel = Math.floor(item.indent / 2)
      item.level = currentBaseLevel + 1 + indentLevel
    }
  }

  // 构建树结构（simple-mind-map 格式）
  const root = {
    data: { text: parsedLines[0].text },
    children: []
  }
  const stack = [{ node: root, level: parsedLines[0].level }]

  for (let i = 1; i < parsedLines.length; i++) {
    const current = parsedLines[i]
    const newNode = {
      data: { text: current.text },
      children: []
    }

    // 找到父节点
    while (stack.length > 0 && stack[stack.length - 1].level >= current.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      stack.push({ node: newNode, level: current.level })
    } else {
      const parent = stack[stack.length - 1].node
      parent.children.push(newNode)
      stack.push({ node: newNode, level: current.level })
    }
  }

  return root
}

// 生成独立的 HTML 文件
function generateHTML(data, title, theme = 'default') {
  const smTheme = themeMap[theme] || 'classic'
  const dataJson = JSON.stringify(data)

  // 返回使用 CDN 加载的 HTML，修复 DOM ready 和容器尺寸问题
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #f5f5f5;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        #mindMapContainer {
            width: 100%;
            height: 100vh;
            position: relative;
        }
    </style>
</head>
<body>
    <div id="mindMapContainer"></div>
    <!-- 从 CDN 加载 simple-mind-map 库 -->
    <script src="${CDN_URL}"></script>
    <script>
        // 等待 DOM 和库都加载完成
        window.onload = function() {
            // simple-mind-map 导出为全局 simpleMindMap 对象
            const mindMapData = ${dataJson};
            const mindMap = new simpleMindMap.default({
                el: document.getElementById("mindMapContainer"),
                data: mindMapData,
                theme: "${smTheme}",
                layout: "mindMap",
                enableFreeDrag: true,
                enableNodeEdit: true,
                enableCtrlKeyNodeSelection: true
            });
            console.log("✅ 思维导图已加载");
        };
    </script>
</body>
</html>`
}

// HTML 转义函数
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

const createServer = () => {
  const app = express()

  // 配置 body 解析
  app.use(express.json({ limit: '50mb' }))
  app.use(express.urlencoded({ extended: true, limit: '50mb' }))

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    next()
  })

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({
      code: 0,
      msg: 'Markdown to MindMap API Server is running',
      timestamp: new Date().toISOString(),
      library: 'simple-mind-map',
      version: require('../../simple-mind-map/package.json').version
    })
  })

  // 核心 API：Markdown → HTML
  app.post('/api/markdown-to-html', async (req, res) => {
    try {
      const { markdown, title = '思维导图', theme = 'default', saveToFile = false } = req.body

      if (!markdown) {
        return res.status(400).json({
          code: 1,
          msg: '请提供 markdown 内容'
        })
      }

      // 解析 Markdown 为 simple-mind-map 格式
      const mindMapData = parseMarkdown(markdown)

      // 生成独立 HTML
      const html = generateHTML(mindMapData, title, theme)

      // 生成随机文件名
      const fileName = generateRandomFileName()

      // 可选：保存到文件
      if (saveToFile) {
        const outputDir = path.join(__dirname, '../../output')
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
        }
        fs.writeFileSync(path.join(outputDir, fileName), html)
      }

      res.json({
        code: 0,
        msg: 'success',
        data: {
          fileName: fileName,
          title: title,
          htmlSize: html.length,
          downloadUrl: `/download/${fileName}`
        }
      })

    } catch (error) {
      console.error('转换失败:', error)
      res.status(500).json({
        code: 1,
        msg: '转换失败: ' + error.message
      })
    }
  })

  // 直接下载接口
  app.post('/api/download', async (req, res) => {
    try {
      const { markdown, title = '思维导图', theme = 'default' } = req.body

      if (!markdown) {
        return res.status(400).json({
          code: 1,
          msg: '请提供 markdown 内容'
        })
      }

      const mindMapData = parseMarkdown(markdown)
      const html = generateHTML(mindMapData, title, theme)
      const fileName = generateRandomFileName()

      // 设置响应头
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)

      // 发送 HTML
      res.send(html)

    } catch (error) {
      console.error('生成失败:', error)
      res.status(500).json({
        code: 1,
        msg: '生成失败: ' + error.message
      })
    }
  })

  // GET 下载（用于测试）
  app.get('/download/:fileName', (req, res) => {
    try {
      const { markdown, title, theme } = req.query

      if (!markdown) {
        return res.status(400).send('缺少 markdown 参数')
      }

      const mindMapData = parseMarkdown(markdown)
      const html = generateHTML(mindMapData, title || '思维导图', theme || 'default')

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.fileName}"`)
      res.send(html)

    } catch (error) {
      res.status(500).send('生成失败: ' + error.message)
    }
  })

  // 启动服务器
  app.listen(port, () => {
    console.log('')
    console.log('╔════════════════════════════════════════╗')
    console.log('║  Markdown → MindMap API Server         ║')
    console.log(`║  Running on: http://localhost:${port}     ║`)
    console.log('╚════════════════════════════════════════╝')
    console.log('')
    console.log('📦 使用库: simple-mind-map v' + require('../../simple-mind-map/package.json').version)
    console.log('📦 库文件: dist/simpleMindMap.umd.min.js (6.6MB)')
    console.log('')
    console.log('API 端点:')
    console.log('  POST /api/markdown-to-html  - 转换并返回 JSON')
    console.log('  POST /api/download          - 直接下载 HTML')
    console.log('  GET  /health                - 健康检查')
    console.log('')
    console.log('测试命令:')
    console.log(`  curl -X POST http://localhost:${port}/api/download \\`)
    console.log(`    -H "Content-Type: application/json" \\`)
    console.log(`    -d '{"markdown":"# 标题\\n## 子标题"}' \\`)
    console.log(`    -o mindmap.html`)
    console.log('')
  })
}

// 启动服务器
createServer()
