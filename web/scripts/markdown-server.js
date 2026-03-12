'use strict'

// 加载环境变量
require('dotenv').config()

const express = require('express')
const crypto = require('crypto')
const path = require('path')

const app = express()
const port = process.env.PORT || 3457
const SERVER_URL = process.env.SERVER_URL || 'http://38.134.18.201:3457'
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

// ─── 启动检查 ────────────────────────────────────────────────
if (!GITHUB_TOKEN) {
  console.error('❌ 缺少 GITHUB_TOKEN，请在 .env 文件中配置')
  process.exit(1)
}

// ─── 中间件 ──────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ─── GitHub Gist API 封装 ────────────────────────────────────
const GIST_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'mind-map-server'
}

async function gistCreate(title, data) {
  const fetch = (await import('node-fetch')).default
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: GIST_HEADERS,
    body: JSON.stringify({
      description: title || '思维导图',
      public: false,
      files: {
        'mindmap.json': {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`创建 Gist 失败: ${res.status} ${err}`)
  }
  return res.json()
}

async function gistGet(gistId) {
  const fetch = (await import('node-fetch')).default
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: GIST_HEADERS
  })
  if (!res.ok) throw new Error(`读取 Gist 失败: ${res.status}`)
  return res.json()
}

async function gistUpdate(gistId, data) {
  const fetch = (await import('node-fetch')).default
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: GIST_HEADERS,
    body: JSON.stringify({
      files: {
        'mindmap.json': {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  })
  if (!res.ok) throw new Error(`更新 Gist 失败: ${res.status}`)
  return res.json()
}

async function gistHistory(gistId) {
  const fetch = (await import('node-fetch')).default
  const res = await fetch(`https://api.github.com/gists/${gistId}/commits`, {
    headers: GIST_HEADERS
  })
  if (!res.ok) throw new Error(`读取历史失败: ${res.status}`)
  return res.json()
}

// ─── Markdown 解析 ───────────────────────────────────────────
function parseMarkdown(markdown) {
  const lines = markdown.split('\n').filter(l => l.trim())
  if (lines.length === 0) return { data: { text: '思维导图' }, children: [] }

  const parsed = []
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      parsed.push({ level: h[1].length, text: h[2].trim() })
      continue
    }
    const li = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/)
    if (li) {
      parsed.push({ level: 999, text: li[3].trim(), indent: li[1].length })
    }
  }

  if (parsed.length === 0) return { data: { text: '思维导图' }, children: [] }

  // 计算列表的实际层级
  let baseLevel = 1
  for (const item of parsed) {
    if (item.level !== 999) {
      baseLevel = item.level
    } else {
      item.level = baseLevel + 1 + Math.floor(item.indent / 2)
    }
  }

  // 构建树（simple-mind-map 格式）
  const toNode = text => ({ data: { text }, children: [] })
  const root = toNode(parsed[0].text)
  const stack = [{ node: root, level: parsed[0].level }]

  for (let i = 1; i < parsed.length; i++) {
    const cur = parsed[i]
    const node = toNode(cur.text)
    while (stack.length > 0 && stack[stack.length - 1].level >= cur.level) {
      stack.pop()
    }
    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node)
    }
    stack.push({ node, level: cur.level })
  }

  return root
}

// ─── 生成查看页面 HTML ───────────────────────────────────────
function buildViewPage(gistId, mindMapData, title) {
  const dataJson = JSON.stringify(mindMapData)
  const safeTitle = (title || '思维导图').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; height: 100vh; display: flex; flex-direction: column; }
    #toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 20px; background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0;
    }
    #toolbar h1 { font-size: 16px; color: #333; }
    #toolbar .actions { display: flex; gap: 10px; align-items: center; }
    #saveBtn {
      padding: 6px 18px; background: #4e6ef2; color: #fff;
      border: none; border-radius: 6px; cursor: pointer; font-size: 14px;
    }
    #saveBtn:hover { background: #3a5bd9; }
    #saveBtn:disabled { background: #aaa; cursor: not-allowed; }
    #historyBtn {
      padding: 6px 14px; background: #fff; color: #555;
      border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 14px;
    }
    #historyBtn:hover { background: #f5f5f5; }
    #status { font-size: 12px; color: #999; }
    #mindMapContainer { flex: 1; width: 100%; }

    /* 历史面板 */
    #historyPanel {
      display: none; position: fixed; right: 0; top: 0; bottom: 0; width: 300px;
      background: #fff; box-shadow: -2px 0 8px rgba(0,0,0,0.15);
      z-index: 100; flex-direction: column;
    }
    #historyPanel.open { display: flex; }
    #historyHeader {
      padding: 16px; border-bottom: 1px solid #eee;
      display: flex; justify-content: space-between; align-items: center;
    }
    #historyHeader h2 { font-size: 15px; color: #333; }
    #closeHistory { background: none; border: none; font-size: 20px; cursor: pointer; color: #999; }
    #historyList { flex: 1; overflow-y: auto; padding: 8px; }
    .history-item {
      padding: 10px 12px; border-radius: 6px; cursor: pointer;
      border: 1px solid #eee; margin-bottom: 6px;
    }
    .history-item:hover { background: #f5f7ff; border-color: #4e6ef2; }
    .history-item .time { font-size: 13px; color: #333; font-weight: 500; }
    .history-item .version { font-size: 11px; color: #999; margin-top: 2px; font-family: monospace; }
  </style>
</head>
<body>
  <div id="toolbar">
    <h1>${safeTitle}</h1>
    <div class="actions">
      <span id="status">已加载</span>
      <button id="historyBtn" onclick="toggleHistory()">📋 历史版本</button>
      <button id="saveBtn" onclick="saveMindMap()">💾 保存</button>
    </div>
  </div>
  <div id="mindMapContainer"></div>

  <div id="historyPanel">
    <div id="historyHeader">
      <h2>历史版本</h2>
      <button id="closeHistory" onclick="toggleHistory()">×</button>
    </div>
    <div id="historyList"><p style="padding:16px;color:#999;font-size:13px">加载中...</p></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/simple-mind-map@0.14.0-fix.1/dist/simpleMindMap.umd.min.js"></script>
  <script>
    const GIST_ID = '${gistId}'
    // 动态获取当前页面的协议和主机，避免跨域问题
    const SERVER = window.location.protocol + '//' + window.location.host
    let mindMap = null

    // 初始化思维导图
    window.onload = function() {
      const data = ${dataJson}
      mindMap = new simpleMindMap.default({
        el: document.getElementById('mindMapContainer'),
        data: data,
        layout: 'logicalStructure',
        theme: 'classic',
        enableFreeDrag: true,
        enableNodeEdit: true
      })
      setStatus('已加载')
    }

    // 保存到服务器（更新 Gist）
    async function saveMindMap() {
      const btn = document.getElementById('saveBtn')
      btn.disabled = true
      setStatus('保存中...')
      try {
        const data = mindMap.getData()
        const res = await fetch(SERVER + '/api/save/' + GIST_ID, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        })
        const json = await res.json()
        if (json.code === 0) {
          setStatus('✅ 已保存 ' + new Date().toLocaleTimeString())
        } else {
          setStatus('❌ 保存失败: ' + json.msg)
        }
      } catch(e) {
        setStatus('❌ 网络错误')
      }
      btn.disabled = false
    }

    // 显示/隐藏历史面板
    async function toggleHistory() {
      const panel = document.getElementById('historyPanel')
      const isOpen = panel.classList.toggle('open')
      if (isOpen) loadHistory()
    }

    async function loadHistory() {
      const list = document.getElementById('historyList')
      list.innerHTML = '<p style="padding:16px;color:#999;font-size:13px">加载中...</p>'
      try {
        const res = await fetch(SERVER + '/api/history/' + GIST_ID)
        const json = await res.json()
        if (json.code !== 0) { list.innerHTML = '<p style="padding:16px;color:red">加载失败</p>'; return }
        const commits = json.data
        if (commits.length === 0) { list.innerHTML = '<p style="padding:16px;color:#999;font-size:13px">暂无历史</p>'; return }
        list.innerHTML = commits.map((c, i) => {
          const time = new Date(c.committed_at || c.created_at).toLocaleString()
          return '<div class="history-item">'
            + '<div class="time">' + (i === 0 ? '🟢 当前版本  ' : '') + time + '</div>'
            + '<div class="version">' + c.version.substring(0, 12) + '</div>'
            + '</div>'
        }).join('')
      } catch(e) {
        list.innerHTML = '<p style="padding:16px;color:red">网络错误</p>'
      }
    }

    function setStatus(msg) {
      document.getElementById('status').textContent = msg
    }
  </script>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════
// 路由
// ═══════════════════════════════════════════════════════════════

// 健康检查
app.get('/health', (req, res) => {
  res.json({ code: 0, msg: 'Mind Map Server is running', version: '2.0.0' })
})

// ── POST /api/create ─────────────────────────────────────────
// 传入 markdown，创建 Gist，返回可访问的链接
app.post('/api/create', async (req, res) => {
  try {
    const { markdown, title } = req.body
    if (!markdown) return res.status(400).json({ code: 1, msg: '缺少 markdown 参数' })

    const mindMapData = parseMarkdown(markdown)
    const payload = { title: title || '思维导图', data: mindMapData, createdAt: new Date().toISOString() }

    const gist = await gistCreate(title, payload)
    const viewUrl = `${SERVER_URL}/view/${gist.id}`

    res.json({
      code: 0,
      msg: 'success',
      data: {
        gistId: gist.id,
        viewUrl,
        gistUrl: gist.html_url
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ code: 1, msg: e.message })
  }
})

// ── GET /view/:gistId ────────────────────────────────────────
// 从 Gist 读数据，返回可交互的 HTML 页面
app.get('/view/:gistId', async (req, res) => {
  try {
    const gist = await gistGet(req.params.gistId)
    const fileContent = gist.files['mindmap.json']?.content
    if (!fileContent) return res.status(404).send('数据不存在')

    const payload = JSON.parse(fileContent)
    const html = buildViewPage(req.params.gistId, payload.data, payload.title)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) {
    console.error(e)
    res.status(500).send(`<h2>加载失败</h2><pre>${e.message}</pre>`)
  }
})

// ── POST /api/save/:gistId ───────────────────────────────────
// 用户编辑后保存，更新 Gist（产生新版本记录）
app.post('/api/save/:gistId', async (req, res) => {
  try {
    const { data } = req.body
    if (!data) return res.status(400).json({ code: 1, msg: '缺少 data 参数' })

    // 先读现有数据拿到 title
    const gist = await gistGet(req.params.gistId)
    const old = JSON.parse(gist.files['mindmap.json']?.content || '{}')

    await gistUpdate(req.params.gistId, {
      title: old.title || '思维导图',
      data,
      updatedAt: new Date().toISOString()
    })

    res.json({ code: 0, msg: 'saved' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ code: 1, msg: e.message })
  }
})

// ── GET /api/history/:gistId ─────────────────────────────────
// 返回版本历史列表
app.get('/api/history/:gistId', async (req, res) => {
  try {
    const commits = await gistHistory(req.params.gistId)
    res.json({ code: 0, data: commits })
  } catch (e) {
    res.status(500).json({ code: 1, msg: e.message })
  }
})

// ── 旧接口兼容：POST /api/download ──────────────────────────
// 保留原来的接口，直接返回 HTML（无持久化）
app.post('/api/download', async (req, res) => {
  try {
    const { markdown, title } = req.body
    if (!markdown) return res.status(400).json({ code: 1, msg: '缺少 markdown 参数' })

    const mindMapData = parseMarkdown(markdown)
    const html = buildViewPage('__local__', mindMapData, title)

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="mindmap-${Date.now()}.html"`)
    res.send(html)
  } catch (e) {
    res.status(500).json({ code: 1, msg: e.message })
  }
})

// ─── 启动 ────────────────────────────────────────────────────
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Mind Map Server 运行中`)
  console.log(`   本地访问: http://localhost:${port}`)
  console.log(`   公网访问: ${SERVER_URL}`)
  console.log(`   健康检查: ${SERVER_URL}/health`)
  console.log('')
  console.log('📌 API 说明:')
  console.log(`   POST /api/create     → 传入 markdown，返回永久链接`)
  console.log(`   GET  /view/:gistId   → 打开可编辑的思维导图`)
  console.log(`   POST /api/save/:id   → 保存修改（自动版本记录）`)
  console.log(`   GET  /api/history/:id → 查看历史版本`)
})
